import { describe, expect, it, vi } from 'vitest';
import { EVENT } from '../events/event-types.js';
import { QualificationService } from './qualification.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventsService } from '../events/events.service.js';
import type { LlmService } from '../ai/llm.service.js';

const createdAt = new Date('2026-11-19T08:00:00.000Z');
const inbound = {
  id: 'message-1',
  content: 'Je cherche un gravel pour rouler le week-end, budget 1200 euros',
  createdAt,
  conversation: {
    id: 'conversation-1',
    prospect: {
      id: 'prospect-1',
      name: 'Camille Martin',
      humanTakeover: false,
      score: null,
      temperature: null,
      need: null,
      budgetEur: null,
      urgency: null,
    },
  },
};

function makeScenario(llmResponse: string | null) {
  let handler: ((event: never) => Promise<void>) | undefined;
  const emitted: Array<{ type: string; payload?: Record<string, unknown> }> =
    [];
  const events = {
    on: vi.fn((_type: unknown, callback: typeof handler) => {
      handler = callback;
      return { unsubscribe: vi.fn() };
    }),
    emit: vi.fn(
      async (input: {
        type: string;
        agent: string;
        prospectId?: string | null;
        payload?: Record<string, unknown>;
      }) => {
        emitted.push(input);
        if (
          input.type === EVENT.CONVERSATION_MESSAGE &&
          input.payload?.role === 'PROSPECT'
        ) {
          await handler?.({
            id: 'event-1',
            type: input.type,
            agent: input.agent,
            prospectId: input.prospectId ?? null,
            payload: input.payload,
            createdAt: createdAt.toISOString(),
            persisted: true,
          } as never);
        }
      },
    ),
  };
  const inventory = [
    {
      sku: 'GRAVEL-1',
      name: 'Vélo Gravel 1',
      category: 'BIKE',
      stock: 2,
      priceCents: 119900,
    },
  ];
  const prisma = {
    message: {
      findUnique: vi.fn().mockResolvedValue(inbound),
      findMany: vi
        .fn()
        .mockResolvedValue([{ role: 'PROSPECT', content: inbound.content }]),
      create: vi.fn().mockResolvedValue({ id: 'assistant-1' }),
    },
    product: { findMany: vi.fn().mockResolvedValue(inventory) },
    prospect: { update: vi.fn().mockResolvedValue({}) },
    agentRun: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  const service = new QualificationService(
    prisma as unknown as PrismaService,
    events as unknown as EventsService,
    {
      complete: vi.fn().mockResolvedValue(llmResponse),
    } as unknown as LlmService,
  );
  service.onModuleInit();
  return { service, prisma, emitted, events };
}

describe('QualificationService', () => {
  it('qualifie sur le bus, lit le stock et répond en mode secours sans IA', async () => {
    const { service, prisma, emitted } = makeScenario(null);

    const response = await service.submit({
      messageId: inbound.id,
      conversationId: 'conversation-1',
      prospectId: 'prospect-1',
    });

    expect(response.mode).toBe('fallback');
    expect(response.reply).toContain('Bonjour Camille');
    expect(response.reply).toContain('Vélo Gravel 1');
    expect(response.reply).toContain('2 disponibles');
    expect(response.qualification.budgetEur).toBe(1200);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
    expect(prisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FALLBACK' }),
      }),
    );
    expect(
      emitted.some((event) => event.type === EVENT.PROSPECT_QUALIFIED),
    ).toBe(true);
    service.onModuleDestroy();
  });

  it('utilise la réponse structurée du faux fournisseur LLM et enregistre la réussite', async () => {
    const { service, prisma } = makeScenario(
      JSON.stringify({
        reply:
          'Bonjour Camille, ce gravel est disponible. Quel type de terrain préférez-vous ?',
        need: 'Vélo gravel',
        budgetEur: 1200,
        urgency: 'MEDIUM',
        score: 82,
        productSku: 'GRAVEL-1',
        reason: 'Usage, budget et délai identifiés.',
      }),
    );

    const response = await service.submit({
      messageId: inbound.id,
      conversationId: 'conversation-1',
      prospectId: 'prospect-1',
    });

    expect(response).toMatchObject({
      mode: 'ai',
      reply: expect.stringContaining('ce gravel est disponible'),
      qualification: { score: 82, temperature: 'HOT', budgetEur: 1200 },
    });
    expect(prisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
    );
    service.onModuleDestroy();
  });

  it('ne fait pas répondre l’agent quand un conseiller a repris la conversation', async () => {
    const { service, events } = makeScenario(null);
    const findUnique = vi.fn().mockResolvedValue({
      ...inbound,
      conversation: {
        ...inbound.conversation,
        prospect: { ...inbound.conversation.prospect, humanTakeover: true },
      },
    });
    const prisma = { message: { findUnique } } as unknown as PrismaService;
    const humanService = new QualificationService(
      prisma,
      events as unknown as EventsService,
      { complete: vi.fn() } as unknown as LlmService,
    );
    humanService.onModuleInit();
    const submit = humanService.submit({
      messageId: inbound.id,
      conversationId: 'conversation-1',
      prospectId: 'prospect-1',
    });
    const callback = (events.on as ReturnType<typeof vi.fn>).mock
      .calls[1][1] as (event: never) => Promise<void>;
    await callback({
      id: 'event-1',
      type: EVENT.CONVERSATION_MESSAGE,
      agent: 'ORCHESTRATOR',
      prospectId: 'prospect-1',
      payload: {
        role: 'PROSPECT',
        messageId: inbound.id,
        conversationId: 'conversation-1',
      },
      createdAt: createdAt.toISOString(),
      persisted: true,
    } as never);
    await expect(submit).resolves.toMatchObject({ mode: 'human' });
    humanService.onModuleDestroy();
    service.onModuleDestroy();
  });
});
