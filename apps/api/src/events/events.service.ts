import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Subject, filter } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';
import type { AgentEvent, AgentName, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventType } from './event-types.js';

/** Forme d'un evenement tel que les agents et le dashboard le recoivent. */
export interface AgentEventMessage {
  id: string;
  type: string;
  agent: AgentName;
  prospectId: string | null;
  payload: Record<string, unknown>;
  createdAt: string; // ISO 8601
  /** false si l'ecriture en base a echoue (l'evenement est quand meme diffuse). */
  persisted: boolean;
}

export interface EmitInput {
  type: EventType;
  agent: AgentName;
  prospectId?: string | null;
  payload?: Record<string, unknown>;
}

export interface RecentEventsQuery {
  limit?: number;
  prospectId?: string;
  type?: string;
}

export type EventHandler = (event: AgentEventMessage) => void | Promise<void>;

function toMessage(row: AgentEvent): AgentEventMessage {
  return {
    id: row.id,
    type: row.type,
    agent: row.agent,
    prospectId: row.prospectId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    persisted: true,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Bus d'evenements interne de PedalPilot.
 *
 * - emit()   : enregistre l'evenement en base (AgentEvent) PUIS le diffuse.
 * - on()     : un agent s'abonne a un ou plusieurs types d'evenements.
 * - stream() : flux de tous les evenements (utilise par le SSE du dashboard).
 *
 * Garanties : un handler qui plante n'affecte ni les autres handlers ni l'emetteur ;
 * si la base est indisponible, l'evenement est quand meme diffuse (persisted: false).
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly bus = new Subject<AgentEventMessage>();

  constructor(private readonly prisma: PrismaService) {}

  async emit(input: EmitInput): Promise<AgentEventMessage> {
    const payload = input.payload ?? {};
    const prospectId = input.prospectId ?? null;
    let message: AgentEventMessage;

    try {
      const row = await this.prisma.agentEvent.create({
        data: {
          type: input.type,
          agent: input.agent,
          prospectId,
          payload: payload as Prisma.InputJsonValue,
        },
      });
      message = toMessage(row);
    } catch (error) {
      this.logger.error(`Ecriture impossible pour l'evenement ${input.type} : ${errorMessage(error)}`);
      message = {
        id: randomUUID(),
        type: input.type,
        agent: input.agent,
        prospectId,
        payload,
        createdAt: new Date().toISOString(),
        persisted: false,
      };
    }

    this.bus.next(message);
    return message;
  }

  /** Flux de tous les evenements, en direct. */
  stream(): Observable<AgentEventMessage> {
    return this.bus.asObservable();
  }

  /** Abonne un agent a un ou plusieurs types d'evenements. Retourne l'abonnement. */
  on(types: EventType | EventType[], handler: EventHandler): Subscription {
    const wanted = new Set<string>(Array.isArray(types) ? types : [types]);
    return this.bus
      .pipe(filter((event) => wanted.has(event.type)))
      .subscribe((event) => {
        void this.runHandler(handler, event);
      });
  }

  /** Historique recent (plus recent d'abord). */
  async recent(query: RecentEventsQuery = {}): Promise<AgentEventMessage[]> {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const rows = await this.prisma.agentEvent.findMany({
      where: {
        ...(query.prospectId ? { prospectId: query.prospectId } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map(toMessage);
  }

  private async runHandler(handler: EventHandler, event: AgentEventMessage): Promise<void> {
    try {
      await handler(event);
    } catch (error) {
      this.logger.error(`Handler en echec pour ${event.type} (${event.id}) : ${errorMessage(error)}`);
    }
  }
}
