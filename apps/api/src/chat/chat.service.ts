import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { EVENT } from '../events/event-types.js';
import { QualificationService } from '../qualification/qualification.service.js';
import type { ChatResponse } from '../qualification/qualification.service.js';
import { FollowupsService } from '../followups/followups.service.js';

export interface ChatRequest {
  message: string;
  name?: string;
  email?: string;
  emailFollowUpConsent?: boolean;
  phone?: string;
  whatsappFollowUpConsent?: boolean;
  prospectId?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly qualification: QualificationService,
    private readonly followups: FollowupsService,
  ) {}

  async send(input: ChatRequest): Promise<ChatResponse> {
    const message =
      typeof input.message === 'string' ? input.message.trim() : '';
    if (!message || message.length > 2000) {
      throw new BadRequestException(
        'Le message doit contenir entre 1 et 2000 caractères.',
      );
    }
    const name =
      typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
    const email =
      typeof input.email === 'string'
        ? input.email.trim().toLowerCase().slice(0, 254)
        : '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Adresse e-mail invalide.');
    }
    const rawPhone = typeof input.phone === 'string' ? input.phone.trim() : '';
    const phone = rawPhone ? rawPhone.replace(/[\s().-]/g, '') : '';
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
      throw new BadRequestException('Saisissez un numéro au format international, par exemple +261 34 12 345 67.');
    }
    const existing = input.prospectId
      ? await this.prisma.prospect.findUnique({
          where: { id: input.prospectId },
          include: {
            conversations: {
              where: { channel: 'WEB_CHAT' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        })
      : email
        ? await this.prisma.prospect.findUnique({
            where: { email },
            include: {
              conversations: {
                where: { channel: 'WEB_CHAT' },
                orderBy: { updatedAt: 'desc' },
                take: 1,
              },
            },
          })
        : null;
    if (input.prospectId && !existing)
      throw new NotFoundException('Prospect introuvable.');
    if (input.whatsappFollowUpConsent && !phone && !existing?.phone) {
      throw new BadRequestException('Un numéro de téléphone est nécessaire pour accepter les relances WhatsApp.');
    }

    const isNew = !existing;
    let prospectId: string;
    let conversationId: string;
    if (existing) {
      prospectId = existing.id;
      if (email && existing.email !== email) {
        const emailOwner = await this.prisma.prospect.findUnique({
          where: { email },
          select: { id: true },
        });
        if (emailOwner && emailOwner.id !== existing.id) {
          throw new BadRequestException(
            'Cette adresse e-mail est déjà associée à un autre prospect.',
          );
        }
        await this.prisma.prospect.update({
          where: { id: existing.id },
          data: { email },
        });
      }
      if (typeof input.emailFollowUpConsent === 'boolean') {
        await this.prisma.prospect.update({
          where: { id: existing.id },
          data: { emailFollowUpConsent: Boolean(email && input.emailFollowUpConsent) },
        });
      }
      if (phone || typeof input.whatsappFollowUpConsent === 'boolean') {
        await this.prisma.prospect.update({
          where: { id: existing.id },
          data: {
            ...(phone ? { phone } : {}),
            ...(typeof input.whatsappFollowUpConsent === 'boolean'
              ? { whatsappFollowUpConsent: Boolean((phone || existing.phone) && input.whatsappFollowUpConsent) }
              : phone && phone !== existing.phone
                ? { whatsappFollowUpConsent: false }
              : {}),
          },
        });
      }
      let conversation = existing.conversations[0];
      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: { prospectId, channel: 'WEB_CHAT' },
        });
      }
      conversationId = conversation.id;
    } else {
      const prospect = await this.prisma.prospect.create({
        data: {
          name: name || 'Nouveau prospect',
          ...(email ? { email } : {}),
          emailFollowUpConsent: Boolean(email && input.emailFollowUpConsent),
          ...(phone ? { phone } : {}),
          whatsappFollowUpConsent: Boolean(phone && input.whatsappFollowUpConsent),
          source: 'landing_chat',
          conversations: { create: { channel: 'WEB_CHAT' } },
        },
        include: { conversations: true },
      });
      prospectId = prospect.id;
      conversationId = prospect.conversations[0].id;
    }

    const userMessage = await this.prisma.message.create({
      data: { conversationId, role: 'PROSPECT', content: message },
    });
    await this.prisma.prospect.update({
      where: { id: prospectId },
      data: { lastActivityAt: new Date() },
    });
    if (isNew) {
      await this.events.emit({
        type: EVENT.PROSPECT_CREATED,
        agent: 'ORCHESTRATOR',
        prospectId,
        payload: { source: 'WEB_CHAT', name: name || 'Nouveau prospect' },
      });
    }

    await this.followups.cancelForProspect(prospectId, 'new_incoming_message');
    const response = await this.qualification.submit({
      messageId: userMessage.id,
      conversationId,
      prospectId,
    });
    try {
      await this.followups.scheduleAfterMessage(prospectId);
    } catch (error) {
      this.logger.warn(`Planification de relance impossible pour ${prospectId}: ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    }
    return response;
  }
}
