import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { AppointmentType } from '@prisma/client';
import { EventsService } from '../events/events.service.js';
import { EVENT } from '../events/event-types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { N8nMailService } from './n8n-mail.service.js';
import { ResendMailService } from './resend-mail.service.js';
import { FollowupsService } from '../followups/followups.service.js';
import { addLocalDays, datePartsInZone, localDateTimeToUtc, weekdayOf } from './slot-utils.js';

const appointmentTypes = new Set<AppointmentType>([
  'REPAIR',
  'TEST_RIDE',
  'PURCHASE',
  'FITTING',
]);
const durations: Record<AppointmentType, number> = {
  REPAIR: 60,
  TEST_RIDE: 45,
  PURCHASE: 30,
  FITTING: 60,
};

export interface CreateAppointmentInput {
  prospectId: string;
  startsAt: string;
  type: string;
  email?: string;
  notes?: string;
  productId?: string;
}

function durationFor(type: AppointmentType) {
  return durations[type];
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly googleCalendar: GoogleCalendarService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly followups?: FollowupsService,
    @Optional() private readonly n8nMail?: N8nMailService,
    @Optional() private readonly mail?: ResendMailService,
  ) {}

  async list(prospectId?: string) {
    return this.prisma.appointment.findMany({
      where: prospectId ? { prospectId } : { startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 100,
      include: {
        prospect: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true } },
      },
    });
  }

  async availableSlots(typeInput: string, fromInput?: string, daysInput?: string) {
    const type = typeInput?.toUpperCase() as AppointmentType;
    if (!appointmentTypes.has(type)) throw new BadRequestException('Type de rendez-vous invalide.');
    const timeZone = this.config?.get<string>('BUSINESS_TIME_ZONE') || 'Europe/Paris';
    const dayCount = Math.min(Math.max(Number.parseInt(daysInput ?? '7', 10) || 7, 1), 14);
    let fromDate = new Date();
    let firstDay: ReturnType<typeof datePartsInZone>;
    if (fromInput) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(fromInput)) {
        const [year, month, day] = fromInput.split('-').map(Number);
        firstDay = { year, month, day };
      } else {
        fromDate = new Date(fromInput);
        if (Number.isNaN(fromDate.getTime())) throw new BadRequestException('Date de début invalide.');
        firstDay = datePartsInZone(fromDate, timeZone);
      }
    } else {
      firstDay = datePartsInZone(fromDate, timeZone);
    }
    const openHour = Number(this.config?.get('BUSINESS_OPEN_HOUR') ?? 9);
    const closeHour = Number(this.config?.get('BUSINESS_CLOSE_HOUR') ?? 17);
    const interval = Number(this.config?.get('BUSINESS_SLOT_INTERVAL_MIN') ?? 30);
    const leadHours = Number(this.config?.get('BUSINESS_MIN_LEAD_HOURS') ?? 2);
    const openDays = new Set((this.config?.get<string>('BUSINESS_DAYS') ?? '1,2,3,4,5,6').split(',').map((day) => Number(day.trim())).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
    if (!Number.isInteger(openHour) || !Number.isInteger(closeHour) || openHour < 0 || closeHour > 24 || openHour >= closeHour || !Number.isInteger(interval) || interval < 10 || interval > 120) {
      throw new BadRequestException('Les horaires métier sont mal configurés.');
    }
    const lastDay = addLocalDays(firstDay, dayCount);
    const rangeStart = localDateTimeToUtc(firstDay, 0, 0, timeZone);
    const rangeEnd = localDateTimeToUtc(lastDay, 0, 0, timeZone);
    const [booked, googleBusy] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { status: { in: ['PROPOSED', 'CONFIRMED'] }, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
        select: { startsAt: true, endsAt: true },
      }),
      this.googleCalendar.busyTimes?.(rangeStart, rangeEnd, timeZone) ?? Promise.resolve([]),
    ]);
    const busy = [...booked.map((item) => ({ start: item.startsAt, end: item.endsAt })), ...googleBusy];
    const duration = durationFor(type) * 60_000;
    const earliest = Date.now() + Math.max(0, Number.isFinite(leadHours) ? leadHours : 2) * 60 * 60_000;
    const slots: Array<{ startsAt: string; endsAt: string; label: string }> = [];
    for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
      const day = addLocalDays(firstDay, dayIndex);
      if (!openDays.has(weekdayOf(day))) continue;
      for (let minuteOfDay = openHour * 60; minuteOfDay + duration / 60_000 <= closeHour * 60; minuteOfDay += interval) {
        const startsAt = localDateTimeToUtc(day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, timeZone);
        const endsAt = new Date(startsAt.getTime() + duration);
        if (startsAt.getTime() < earliest) continue;
        if (busy.some((item) => startsAt < item.end && endsAt > item.start)) continue;
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          label: new Intl.DateTimeFormat('fr-FR', { timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(startsAt),
        });
      }
    }
    return { timeZone, slots };
  }

  async propose(input: CreateAppointmentInput, targetStatus: 'PROPOSED' | 'CONFIRMED' = 'PROPOSED') {
    const prospectId = typeof input?.prospectId === 'string' ? input.prospectId.trim() : '';
    const startsAt = new Date(input?.startsAt ?? '');
    const type = input?.type?.toUpperCase() as AppointmentType;
    const notes = typeof input?.notes === 'string' ? input.notes.trim().slice(0, 500) : '';
    const productId = typeof input?.productId === 'string' ? input.productId.trim() : '';

    if (!prospectId) throw new BadRequestException('prospectId est obligatoire.');
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      throw new BadRequestException('Choisissez un horaire futur valide.');
    }
    if (!appointmentTypes.has(type)) {
      throw new BadRequestException('Type de rendez-vous invalide.');
    }

    const prospect = await this.prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) throw new NotFoundException('Prospect introuvable.');
    const endsAt = new Date(startsAt.getTime() + durations[type] * 60_000);
    const [conflict, calendarBusy] = await Promise.all([this.prisma.appointment.findFirst({
      where: {
        status: { in: ['PROPOSED', 'CONFIRMED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    }), this.googleCalendar.busyTimes?.(startsAt, new Date(startsAt.getTime() + durations[type] * 60_000), this.config?.get<string>('BUSINESS_TIME_ZONE') || 'Europe/Paris') ?? Promise.resolve([])]);
    if (conflict || calendarBusy.some((item) => startsAt < item.end && startsAt.getTime() + durations[type] * 60_000 > item.start.getTime())) {
      throw new ConflictException('Ce créneau est déjà occupé dans PedalPilot ou Google Calendar. Actualisez les disponibilités.');
    }

    const cancelToken = randomBytes(32).toString('hex');
    let appointment;
    try {
      appointment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.appointment.create({
          data: {
            prospectId,
            type,
            status: targetStatus,
            startsAt,
            endsAt,
            notes: notes || null,
            productId: productId || null,
            cancelToken,
          },
          include: { prospect: { select: { id: true, name: true, email: true } } },
        });

        const concurrentConflict = await tx.appointment.findFirst({
          where: { id: { not: created.id }, status: { in: ['PROPOSED', 'CONFIRMED'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
          select: { id: true },
        });
        if (concurrentConflict) throw new ConflictException('Ce créneau vient d’être réservé. Actualisez les disponibilités.');

        if (productId) {
          // Décrément conditionnel et réservation atomiques : deux demandes
          // simultanées ne peuvent pas prendre la dernière unité.
          const changed = await tx.product.updateMany({
            where: { id: productId, active: true, stock: { gte: 1 } },
            data: { stock: { decrement: 1 } },
          });
          if (!changed.count) {
            throw new ConflictException('Ce produit est indisponible ou vient d’être réservé. Actualisez le stock.');
          }
          await tx.reservation.create({
            data: { productId, prospectId, appointmentId: created.id, quantity: 1, status: 'ACTIVE' },
          });
          await tx.stockMovement.create({
            data: { productId, delta: -1, reason: 'RESERVATION', refType: 'APPOINTMENT', refId: created.id },
          });
        }
        if (targetStatus === 'CONFIRMED') {
          await tx.prospect.update({ where: { id: prospectId }, data: { status: 'APPOINTMENT_BOOKED' } });
        }
        return created;
      });
    } catch (error) {
      if (productId && error instanceof ConflictException) {
        await this.events.emit({
          type: EVENT.STOCK_UNAVAILABLE,
          agent: 'INVENTORY',
          prospectId,
          payload: { productId, reason: 'not_available_for_appointment' },
        });
      }
      throw error;
    }

    await this.followups?.cancelForProspect(prospectId, targetStatus === 'CONFIRMED' ? 'appointment_booked' : 'appointment_proposed');

    let calendarSync: { status: 'synced' | 'not_configured' | 'failed'; message?: string } = {
      status: 'not_configured',
    };
    if (this.googleCalendar.isConfigured()) {
      try {
        const googleEvent = await this.googleCalendar.createEvent({
          type,
          prospectFirstName: prospect.name.trim().split(/\s+/)[0] || 'Prospect',
          startsAt,
          endsAt,
        });
        appointment = await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { googleEventId: googleEvent.id },
          include: { prospect: { select: { id: true, name: true, email: true } } },
        });
        calendarSync = { status: 'synced' };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Synchronisation Google Calendar impossible.';
        this.logger.warn(`Synchronisation Google Calendar échouée pour le rendez-vous ${appointment.id}: ${message}`);
        calendarSync = { status: 'failed', message };
      }
    }

    let emailSync: 'sent' | 'not_configured' | 'no_email' | 'failed' = 'no_email';
    if (prospect.email && (this.n8nMail?.isConfigured() || this.mail?.isConfigured())) {
      try {
        const mailer = this.n8nMail?.isConfigured() ? this.n8nMail : this.mail;
        emailSync = await mailer!.sendAppointmentSummary({
          to: prospect.email,
          firstName: prospect.name.trim().split(/\s+/)[0] || 'Bonjour',
          type,
          startsAt,
          cancelToken,
        });
        if (emailSync === 'sent') {
          appointment = await this.prisma.appointment.update({
            where: { id: appointment.id },
            data: { emailSentAt: new Date() },
            include: { prospect: { select: { id: true, name: true, email: true } } },
          });
        }
      } catch (error) {
        emailSync = 'failed';
        const message = error instanceof Error ? error.message : 'Envoi de l’e-mail impossible.';
        this.logger.warn(`E-mail du rendez-vous ${appointment.id} non envoyé: ${message}`);
      }
    } else if (prospect.email) {
      emailSync = 'not_configured';
    }

    await this.events.emit({
      type: targetStatus === 'CONFIRMED' ? EVENT.APPOINTMENT_BOOKED : EVENT.APPOINTMENT_PROPOSED,
      agent: 'SCHEDULING',
      prospectId,
      payload: {
        appointmentId: appointment.id,
        type,
        startsAt: startsAt.toISOString(),
        status: targetStatus,
        calendarSync: calendarSync.status,
        emailSync,
      },
    });
    if (productId) {
      await this.events.emit({
        type: EVENT.STOCK_RESERVED,
        agent: 'INVENTORY',
        prospectId,
        payload: { appointmentId: appointment.id, productId, quantity: 1 },
      });
    }
    const { cancelToken: _cancelToken, ...safeAppointment } = appointment;
    return { ...safeAppointment, calendarSync, emailSync, stockReservation: productId ? 'reserved' : 'not_requested' };
  }

  async bookPublic(input: CreateAppointmentInput) {
    if (input.productId) throw new BadRequestException('La réservation de produit se fait avec la boutique.');
    const email = input.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Une adresse e-mail valide est requise pour confirmer le rendez-vous.');
    const existingProspect = await this.prisma.prospect.findUnique({ where: { id: input.prospectId }, select: { id: true } });
    if (!existingProspect) throw new NotFoundException('Prospect introuvable.');
    const owner = await this.prisma.prospect.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== input.prospectId) throw new ConflictException('Cette adresse e-mail est déjà associée à un autre prospect.');
    await this.prisma.prospect.update({ where: { id: input.prospectId }, data: { email } });
    const available = await this.availableSlots(input.type, input.startsAt, '1');
    if (!available.slots.some((slot) => new Date(slot.startsAt).getTime() === new Date(input.startsAt).getTime())) {
      throw new ConflictException('Ce créneau n’est plus disponible ou se trouve hors des horaires de la boutique.');
    }
    return this.propose(input, 'CONFIRMED');
  }

  async cancel(id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
    const wasCancelled = appointment.status === 'CANCELLED';
    if (appointment.status === 'COMPLETED') throw new ConflictException('Un rendez-vous terminé ne peut pas être annulé.');

    let cancelled = appointment;
    if (!wasCancelled) cancelled = await this.prisma.$transaction(async (tx) => {
      const reservations = await tx.reservation.findMany({
        where: { appointmentId: id, status: 'ACTIVE' },
      });
      for (const reservation of reservations) {
        await tx.product.update({
          where: { id: reservation.productId },
          data: { stock: { increment: reservation.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: reservation.productId,
            delta: reservation.quantity,
            reason: 'RELEASE',
            refType: 'APPOINTMENT',
            refId: id,
          },
        });
      }
      await tx.reservation.updateMany({
        where: { appointmentId: id, status: 'ACTIVE' },
        data: { status: 'RELEASED' },
      });
      return tx.appointment.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
    let calendarSync: 'deleted' | 'not_configured' | 'not_synced' | 'failed' = appointment.googleEventId ? 'not_configured' : 'not_synced';
    if (appointment.googleEventId && this.googleCalendar.isConfigured()) {
      try {
        await this.googleCalendar.deleteEvent(appointment.googleEventId);
        calendarSync = 'deleted';
      } catch (error) {
        calendarSync = 'failed';
        this.logger.warn(`Événement Google du rendez-vous ${id} non supprimé: ${error instanceof Error ? error.message : 'erreur inconnue'}`);
      }
    }
    if (!wasCancelled) {
      await this.events.emit({
        type: EVENT.APPOINTMENT_CANCELLED,
        agent: 'SCHEDULING',
        prospectId: appointment.prospectId,
        payload: { appointmentId: id, calendarSync },
      });
    }
    return { id: cancelled.id, status: cancelled.status, calendarCancelSync: calendarSync };
  }

  async cancelByToken(token: string) {
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (!/^[a-f0-9]{64}$/i.test(normalized)) throw new NotFoundException('Lien d’annulation invalide ou expiré.');
    const appointment = await this.prisma.appointment.findUnique({ where: { cancelToken: normalized } });
    if (!appointment) throw new NotFoundException('Lien d’annulation invalide ou expiré.');
    return this.cancel(appointment.id);
  }

  async complete(id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
    if (appointment.status === 'CANCELLED') throw new ConflictException('Un rendez-vous annulé ne peut pas être terminé.');
    if (appointment.status === 'COMPLETED') return appointment;
    if (appointment.endsAt > new Date()) throw new ConflictException('Le rendez-vous ne peut être terminé qu’après son heure de fin.');

    const completed = await this.prisma.$transaction(async (tx) => {
      await tx.reservation.updateMany({
        where: { appointmentId: id, status: 'ACTIVE' },
        data: { status: 'FULFILLED' },
      });
      return tx.appointment.update({ where: { id }, data: { status: 'COMPLETED' } });
    });
    await this.events.emit({
      type: EVENT.APPOINTMENT_COMPLETED,
      agent: 'SCHEDULING',
      prospectId: appointment.prospectId,
      payload: { appointmentId: id, status: 'COMPLETED' },
    });
    return completed;
  }

  async syncWithGoogle(id: string) {
    if (!this.googleCalendar.isConfigured()) {
      return { status: 'not_configured' as const, appointment: null };
    }
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { prospect: { select: { id: true, name: true, email: true } } },
    });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
    if (appointment.googleEventId) return { status: 'synced' as const, appointment };
    if (appointment.status === 'CANCELLED') {
      throw new BadRequestException('Un rendez-vous annulé ne peut pas être synchronisé.');
    }

    const event = await this.googleCalendar.createEvent({
      type: appointment.type,
      prospectFirstName: appointment.prospect.name.trim().split(/\s+/)[0] || 'Prospect',
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    });
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { googleEventId: event.id },
      include: { prospect: { select: { id: true, name: true, email: true } } },
    });
    return { status: 'synced' as const, appointment: updated };
  }
}
