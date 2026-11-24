import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { localDateTimeToUtc } from './slot-utils.js';

type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type GoogleEventResponse = { id?: string; htmlLink?: string; error?: { message?: string } };
type GoogleEventsResponse = { items?: Array<{ start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; transparency?: string; status?: string }>; nextPageToken?: string; error?: { message?: string } };

function allDayBoundary(value: string, timeZone: string) {
  const [year, month, day] = value.split('-').map(Number);
  return localDateTimeToUtc({ year, month, day }, 0, 0, timeZone);
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.config.get('GOOGLE_CLIENT_ID') &&
      this.config.get('GOOGLE_CLIENT_SECRET') &&
      this.config.get('GOOGLE_REFRESH_TOKEN'),
    );
  }

  async createEvent(input: {
    type: string;
    prospectFirstName: string;
    startsAt: Date;
    endsAt: Date;
  }) {
    const accessToken = await this.getAccessToken();
    const calendarId = this.config.get<string>('GOOGLE_CALENDAR_ID') || 'primary';
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    // Do not notify attendees: events are private internal proposals and have no guests.
    url.searchParams.set('sendUpdates', 'none');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: `${this.typeLabel(input.type)} · ${input.prospectFirstName.trim().slice(0, 80)}`,
        description: 'Créneau proposé par PedalPilot.',
        start: { dateTime: input.startsAt.toISOString() },
        end: { dateTime: input.endsAt.toISOString() },
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: false,
      }),
    });
    const result = (await response.json()) as GoogleEventResponse;
    if (!response.ok || !result.id) {
      throw new Error(result.error?.message || `Google Calendar a répondu ${response.status}.`);
    }
    return { id: result.id, htmlLink: result.htmlLink ?? null };
  }

  async deleteEvent(eventId: string) {
    const accessToken = await this.getAccessToken();
    const calendarId = this.config.get<string>('GOOGLE_CALENDAR_ID') || 'primary';
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
    url.searchParams.set('sendUpdates', 'none');
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 404 || response.status === 410) return;
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(result.error?.message || `Google Calendar a répondu ${response.status}.`);
    }
  }

  async busyTimes(timeMin: Date, timeMax: Date, timeZone: string): Promise<Array<{ start: Date; end: Date }>> {
    if (!this.isConfigured()) return [];
    const accessToken = await this.getAccessToken();
    const calendarId = this.config.get<string>('GOOGLE_CALENDAR_ID') || 'primary';
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('timeMin', timeMin.toISOString());
    url.searchParams.set('timeMax', timeMax.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('fields', 'items(start,end,transparency,status),nextPageToken');
    const busy: Array<{ start: Date; end: Date }> = [];
    let pageToken: string | undefined;
    do {
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const result = await response.json() as GoogleEventsResponse;
      if (!response.ok) throw new Error(result.error?.message || `Lecture des disponibilités Google impossible (${response.status}).`);
      for (const event of result.items ?? []) {
        if (event.status === 'cancelled' || event.transparency === 'transparent') continue;
        const start = event.start?.dateTime ? new Date(event.start.dateTime) : event.start?.date ? allDayBoundary(event.start.date, timeZone) : null;
        const end = event.end?.dateTime ? new Date(event.end.dateTime) : event.end?.date ? allDayBoundary(event.end.date, timeZone) : null;
        if (start && end && start < timeMax && end > timeMin) busy.push({ start, end });
      }
      pageToken = result.nextPageToken;
    } while (pageToken);
    return busy;
  }

  private async getAccessToken() {
    if (!this.isConfigured()) throw new Error('Google Calendar n’est pas configuré.');
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return this.accessToken;

    const body = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      refresh_token: this.config.getOrThrow<string>('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const result = (await response.json()) as GoogleTokenResponse;
    if (!response.ok || !result.access_token) {
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      this.logger.warn('Impossible de renouveler le jeton Google Calendar.');
      throw new Error(result.error_description || result.error || 'Authentification Google Calendar refusée.');
    }
    this.accessToken = result.access_token;
    this.tokenExpiresAt = Date.now() + (result.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  private typeLabel(type: string) {
    return ({ TEST_RIDE: 'Essai vélo', PURCHASE: 'Conseil achat', REPAIR: 'Atelier', FITTING: 'Étude posturale' })[type] ?? 'Rendez-vous';
  }
}
