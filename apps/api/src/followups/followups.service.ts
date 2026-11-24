import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FollowUpStatus } from '@prisma/client';
import { EventsService } from '../events/events.service.js';
import { EVENT } from '../events/event-types.js';
import { LlmService } from '../ai/llm.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const htmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);

@Injectable()
export class FollowupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  async scheduleAfterMessage(prospectId: string) {
    await this.prisma.followUp.updateMany({
      where: { prospectId, status: { in: ['SCHEDULED', 'PROCESSING'] } },
      data: { status: 'CANCELLED', processingAt: null },
    });
    const prospect = await this.prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect || !this.canContact(prospect)) return null;
    let optOutToken = prospect.emailOptOutToken;
    if (!optOutToken) {
      optOutToken = randomBytes(32).toString('hex');
      await this.prisma.prospect.update({ where: { id: prospectId }, data: { emailOptOutToken: optOutToken } });
    }
    const firstDelayMinutes = this.positiveConfigNumber('FOLLOWUP_FIRST_DELAY_MINUTES', 24 * 60, 1, 30 * 24 * 60);
    const scheduledFor = new Date(Date.now() + firstDelayMinutes * 60_000);
    const followUp = await this.prisma.followUp.create({
      data: { prospectId, channel: 'EMAIL', content: '', attempt: 1, scheduledFor, status: 'SCHEDULED' },
    });
    await this.events.emit({
      type: EVENT.FOLLOWUP_SCHEDULED,
      agent: 'FOLLOWUP',
      prospectId,
      payload: { followUpId: followUp.id, attempt: 1, scheduledFor: scheduledFor.toISOString() },
    });
    return followUp;
  }

  async cancelForProspect(prospectId: string, reason = 'prospect_activity') {
    const result = await this.prisma.followUp.updateMany({
      where: { prospectId, status: { in: ['SCHEDULED', 'PROCESSING'] } },
      data: { status: 'CANCELLED', processingAt: null, error: reason },
    });
    if (result.count) {
      await this.events.emit({ type: EVENT.FOLLOWUP_CANCELLED, agent: 'FOLLOWUP', prospectId, payload: { count: result.count, reason } });
    }
    return result.count;
  }

  async claimDue(limit = 5) {
    const now = new Date();
    await this.prisma.followUp.updateMany({
      where: { status: 'PROCESSING', processingAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      data: { status: 'SCHEDULED', processingAt: null, error: 'Réessayé après expiration du verrou n8n.' },
    });
    const candidates = await this.prisma.followUp.findMany({
      where: { status: 'SCHEDULED', scheduledFor: { lte: now } },
      orderBy: { scheduledFor: 'asc' },
      take: Math.min(Math.max(limit, 1), 10),
      include: { prospect: true },
    });
    const output: Array<{ followUpId: string; email: string; subject: string; html: string; unsubscribeUrl: string; attempt: number }> = [];
    for (const candidate of candidates) {
      if (!this.canContact(candidate.prospect) || await this.hasUpcomingAppointment(candidate.prospectId)) {
        await this.prisma.followUp.updateMany({ where: { id: candidate.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED', error: 'Contact non autorisé ou rendez-vous planifié.' } });
        continue;
      }
      const claimed = await this.prisma.followUp.updateMany({
        where: { id: candidate.id, status: 'SCHEDULED' },
        data: { status: 'PROCESSING', processingAt: now, error: null },
      });
      if (!claimed.count) continue;
      const prospect = candidate.prospect;
      const conversation = await this.prisma.conversation.findFirst({
        where: { prospectId: prospect.id, channel: 'WEB_CHAT' },
        orderBy: { updatedAt: 'desc' },
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 8 } },
      });
      const transcript = conversation?.messages.reverse().map((message) => `${message.role}: ${message.content}`).join('\n') ?? '';
      const firstName = prospect.name.trim().split(/\s+/)[0] || 'Bonjour';
      let content = await this.personalizedMessage({ firstName, need: prospect.need, budgetEur: prospect.budgetEur, transcript, attempt: candidate.attempt });
      if (!content) {
        content = candidate.attempt === 1
          ? `Bonjour ${firstName}, je reviens vers vous${prospect.need ? ` au sujet de ${prospect.need.toLocaleLowerCase('fr')}` : ' à propos de votre demande'}. Souhaitez-vous que je vous aide à choisir la prochaine étape ?`
          : `Bonjour ${firstName}, je me permets une dernière relance concernant votre demande${prospect.need ? ` de ${prospect.need.toLocaleLowerCase('fr')}` : ''}. Vous pouvez nous répondre ici quand vous le souhaitez.`;
      }
      await this.prisma.followUp.update({ where: { id: candidate.id }, data: { content } });
      const origin = (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000').replace(/\/$/, '');
      const unsubscribeUrl = `${origin}/opt-out?token=${encodeURIComponent(prospect.emailOptOutToken ?? '')}`;
      output.push({
        followUpId: candidate.id,
        email: prospect.email!,
        subject: candidate.attempt === 1 ? 'Votre projet vélo — PedalPilot' : 'Dernier suivi de votre demande — PedalPilot',
        html: `<p>${escapeHtml(content)}</p><p>Répondez simplement à cet e-mail si vous souhaitez reprendre l’échange.</p><hr><p style="font-size:12px;color:#667">Vous ne souhaitez plus recevoir de suivi ? <a href="${escapeHtml(unsubscribeUrl)}">Gérer mes préférences</a></p>`,
        unsubscribeUrl,
        attempt: candidate.attempt,
      });
    }
    return output;
  }

  async complete(id: string, result: { status: string; error?: string }) {
    if (result.status !== 'sent' && result.status !== 'failed') throw new BadRequestException('status doit être sent ou failed.');
    const current = await this.prisma.followUp.findUnique({ where: { id }, include: { prospect: true } });
    if (!current) throw new NotFoundException('Relance introuvable.');
    if (current.status !== 'PROCESSING') return { id, status: current.status, ignored: true };
    const status: FollowUpStatus = result.status === 'sent' ? 'SENT' : 'FAILED';
    await this.prisma.followUp.update({
      where: { id },
      data: { status, sentAt: status === 'SENT' ? new Date() : null, processingAt: null, error: status === 'FAILED' ? (result.error ?? 'Échec signalé par n8n.').slice(0, 500) : null },
    });
    await this.prisma.agentRun.create({
      data: {
        agent: 'FOLLOWUP',
        prospectId: current.prospectId,
        status: status === 'SENT' ? 'SUCCESS' : 'ERROR',
        input: { followUpId: id, attempt: current.attempt, channel: current.channel },
        output: { delivery: status },
        durationMs: current.processingAt ? Math.max(0, Date.now() - current.processingAt.getTime()) : 0,
        error: status === 'FAILED' ? (result.error ?? 'Delivery failed').slice(0, 500) : null,
      },
    });
    if (status === 'SENT') {
      const conversation = await this.prisma.conversation.findFirst({ where: { prospectId: current.prospectId, channel: 'WEB_CHAT' }, orderBy: { updatedAt: 'desc' } });
      if (conversation) await this.prisma.message.create({ data: { conversationId: conversation.id, role: 'AGENT', content: current.content } });
      await this.events.emit({ type: EVENT.FOLLOWUP_SENT, agent: 'FOLLOWUP', prospectId: current.prospectId, payload: { followUpId: id, channel: current.channel, attempt: current.attempt } });
      if (current.attempt < 2 && this.canContact(current.prospect) && !(await this.hasUpcomingAppointment(current.prospectId))) {
        const secondDelayHours = this.positiveConfigNumber('FOLLOWUP_SECOND_DELAY_HOURS', 72, 1, 24 * 30);
        const scheduledFor = new Date(Date.now() + secondDelayHours * 60 * 60_000);
        const followUp = await this.prisma.followUp.create({ data: { prospectId: current.prospectId, channel: 'EMAIL', content: '', attempt: 2, scheduledFor, status: 'SCHEDULED' } });
        await this.events.emit({ type: EVENT.FOLLOWUP_SCHEDULED, agent: 'FOLLOWUP', prospectId: current.prospectId, payload: { followUpId: followUp.id, attempt: 2, scheduledFor: scheduledFor.toISOString() } });
      }
    } else {
      await this.events.emit({ type: EVENT.FOLLOWUP_FAILED, agent: 'FOLLOWUP', prospectId: current.prospectId, payload: { followUpId: id, attempt: current.attempt, error: result.error ?? 'delivery_failed' } });
    }
    return { id, status };
  }

  async list(prospectId?: string) {
    return this.prisma.followUp.findMany({
      where: prospectId ? { prospectId } : undefined,
      orderBy: [{ scheduledFor: 'desc' }],
      take: 100,
      select: { id: true, prospectId: true, channel: true, content: true, status: true, attempt: true, scheduledFor: true, sentAt: true, error: true, prospect: { select: { name: true, email: true } } },
    });
  }

  async retry(id: string) {
    const result = await this.prisma.followUp.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'SCHEDULED', scheduledFor: new Date(), error: null } });
    if (!result.count) throw new NotFoundException('Relance en échec introuvable.');
    return { id, status: 'SCHEDULED' as const };
  }

  async unsubscribe(token: string) {
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (!/^[a-f0-9]{64}$/i.test(normalized)) throw new NotFoundException('Lien de désinscription invalide.');
    const prospect = await this.prisma.prospect.findUnique({ where: { emailOptOutToken: normalized } });
    if (!prospect) throw new NotFoundException('Lien de désinscription invalide.');
    await this.prisma.prospect.update({ where: { id: prospect.id }, data: { emailFollowUpConsent: false } });
    await this.cancelForProspect(prospect.id, 'unsubscribe');
    return { status: 'unsubscribed' as const };
  }

  private canContact(prospect: { email: string | null; emailFollowUpConsent: boolean; humanTakeover: boolean; status: string }) {
    return Boolean(prospect.email && prospect.emailFollowUpConsent && !prospect.humanTakeover && !['WON', 'LOST', 'APPOINTMENT_BOOKED'].includes(prospect.status));
  }

  private positiveConfigNumber(key: string, fallback: number, minimum: number, maximum: number) {
    const value = Number(this.config.get(key) ?? fallback);
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
  }

  private hasUpcomingAppointment(prospectId: string) {
    return this.prisma.appointment.findFirst({ where: { prospectId, status: { in: ['PROPOSED', 'CONFIRMED'] }, endsAt: { gte: new Date() } }, select: { id: true } }).then(Boolean);
  }

  private async personalizedMessage(input: { firstName: string; need: string | null; budgetEur: number | null; transcript: string; attempt: number }) {
    const raw = await this.llm.complete(
      'Rédige une relance commerciale très courte, bienveillante et personnalisée en français pour une boutique de vélos. Ne répète pas les informations déjà connues, ne prétends pas qu’un stock est disponible, ne mets pas de lien ni de prix inventé. Retourne uniquement un JSON {"message":"..."}.',
      JSON.stringify(input),
    );
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as { message?: unknown };
      return typeof value.message === 'string' && value.message.trim() ? value.message.trim().slice(0, 700) : null;
    } catch { return null; }
  }
}
