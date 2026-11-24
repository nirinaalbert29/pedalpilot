import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarService } from './google-calendar.service.js';

describe('GoogleCalendarService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renews OAuth credentials and creates a private event without guests or contact details', async () => {
    const config = {
      get: (key: string) => ({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REFRESH_TOKEN: 'refresh-token',
        GOOGLE_CALENDAR_ID: 'primary',
      })[key],
      getOrThrow: (key: string) => ({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REFRESH_TOKEN: 'refresh-token',
      })[key],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'google-event-id', htmlLink: 'https://calendar.google.com/event' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const calendar = new GoogleCalendarService(config as never);
    const startsAt = new Date('2030-05-20T10:00:00.000Z');
    const endsAt = new Date('2030-05-20T10:45:00.000Z');

    const result = await calendar.createEvent({ type: 'TEST_RIDE', prospectFirstName: 'Camille', startsAt, endsAt });

    expect(result).toEqual({ id: 'google-event-id', htmlLink: 'https://calendar.google.com/event' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0].toString()).toContain('sendUpdates=none');
    const eventPayload = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(eventPayload).toEqual({
      summary: 'Essai vélo · Camille',
      description: 'Créneau proposé par PedalPilot.',
      start: { dateTime: startsAt.toISOString() },
      end: { dateTime: endsAt.toISOString() },
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      guestsCanSeeOtherGuests: false,
    });
    expect(eventPayload).not.toHaveProperty('attendees');
  });
});
