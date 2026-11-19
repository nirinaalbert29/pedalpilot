import { Controller, Get, NotFoundException, Post, Query, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { filter, interval, map, merge } from 'rxjs';
import type { Observable } from 'rxjs';
import { EVENT } from './event-types.js';
import { EventsService } from './events.service.js';
import type { AgentEventMessage } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Historique : GET /events?limit=50&prospectId=...&type=prospect.qualified
   * Le dashboard charge ceci au demarrage, puis ecoute le flux en direct.
   */
  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('prospectId') prospectId?: string,
    @Query('type') type?: string,
  ): Promise<AgentEventMessage[]> {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.events.recent({
      limit: Number.isNaN(parsed) ? undefined : parsed,
      prospectId,
      type,
    });
  }

  /**
   * Flux temps reel (Server-Sent Events) : GET /events/stream[?prospectId=...]
   * Cote navigateur : new EventSource(url).addEventListener('agent-event', handler)
   * (les evenements sont nommes, onmessage ne les recoit pas).
   * Un "ping" toutes les 25 s garde la connexion ouverte derriere un proxy.
   */
  @Sse('stream')
  stream(@Query('prospectId') prospectId?: string): Observable<MessageEvent> {
    const live$ = this.events.stream().pipe(
      filter((event) => !prospectId || event.prospectId === prospectId),
      map((event): MessageEvent => ({ id: event.id, type: 'agent-event', data: event })),
    );
    const heartbeat$ = interval(25_000).pipe(
      map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } })),
    );
    return merge(live$, heartbeat$);
  }

  /** Emet un evenement de test (hors production uniquement) : POST /events/test */
  @Post('test')
  async test(): Promise<AgentEventMessage> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    return this.events.emit({
      type: EVENT.SYSTEM_TEST,
      agent: 'ORCHESTRATOR',
      payload: { message: 'Evenement de test', at: new Date().toISOString() },
    });
  }
}
