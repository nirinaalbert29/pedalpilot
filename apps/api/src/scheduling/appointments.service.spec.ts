import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';

function setup() {
  const prisma = {
    prospect: { findUnique: vi.fn() },
    appointment: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  };
  const events = { emit: vi.fn().mockResolvedValue({ id: 'evt-1' }) };
  const googleCalendar = { isConfigured: vi.fn().mockReturnValue(false), createEvent: vi.fn() };
  return { prisma, events, googleCalendar, service: new AppointmentsService(prisma as never, events as never, googleCalendar as never) };
}

describe('AppointmentsService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enregistre une proposition locale et émet son événement', async () => {
    const { prisma, events, service } = setup();
    prisma.prospect.findUnique.mockResolvedValue({ id: 'prospect-1', name: 'Camille' });
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.create.mockImplementation(({ data }) => Promise.resolve({ id: 'appt-1', ...data }));

    const startsAt = new Date(Date.now() + 86_400_000).toISOString();
    const result = await service.propose({ prospectId: 'prospect-1', startsAt, type: 'TEST_RIDE' });

    expect(result).toMatchObject({ id: 'appt-1', status: 'PROPOSED', type: 'TEST_RIDE' });
    expect(prisma.appointment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PROPOSED',
        endsAt: new Date(new Date(startsAt).getTime() + 45 * 60_000),
      }),
    }));
    expect(events.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'appointment.proposed',
      prospectId: 'prospect-1',
    }));
  });

  it('refuse un créneau déjà occupé localement', async () => {
    const { prisma, service, events } = setup();
    prisma.prospect.findUnique.mockResolvedValue({ id: 'prospect-1', name: 'Camille' });
    prisma.appointment.findFirst.mockResolvedValue({ id: 'existing-appointment' });

    await expect(service.propose({
      prospectId: 'prospect-1',
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      type: 'TEST_RIDE',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('syncs a proposal to Google Calendar and stores its event id', async () => {
    const { prisma, service, googleCalendar } = setup();
    googleCalendar.isConfigured.mockReturnValue(true);
    prisma.prospect.findUnique.mockResolvedValue({ id: 'prospect-1', name: 'Camille' });
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.create.mockResolvedValue({ id: 'appt-1', prospectId: 'prospect-1', status: 'PROPOSED' });
    googleCalendar.createEvent.mockResolvedValue({ id: 'google-event-1', htmlLink: 'https://calendar.google.com/event' });
    prisma.appointment.update.mockResolvedValue({ id: 'appt-1', googleEventId: 'google-event-1' });

    const result = await service.propose({
      prospectId: 'prospect-1',
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      type: 'TEST_RIDE',
    });

    expect(googleCalendar.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'TEST_RIDE',
      prospectFirstName: 'Camille',
    }));
    expect(prisma.appointment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { googleEventId: 'google-event-1' },
    }));
    expect(result).toMatchObject({ calendarSync: { status: 'synced' }, googleEventId: 'google-event-1' });
  });
});
