import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EVENT } from './event-types.js';
import { EventsService } from './events.service.js';
import type { AgentEventMessage } from './events.service.js';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    type: EVENT.PROSPECT_CREATED,
    agent: 'ORCHESTRATOR',
    prospectId: 'p1',
    payload: { source: 'WEB_CHAT' },
    createdAt: new Date('2026-11-18T12:00:00.000Z'),
    ...overrides,
  };
}

function makeService(create = vi.fn().mockResolvedValue(makeRow())) {
  const prisma = { agentEvent: { create, findMany: vi.fn().mockResolvedValue([makeRow()]) } };
  const service = new EventsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('EventsService', () => {
  it('enregistre puis diffuse un evenement', async () => {
    const { service, prisma } = makeService();
    const received: AgentEventMessage[] = [];
    service.stream().subscribe((e) => received.push(e));

    const result = await service.emit({
      type: EVENT.PROSPECT_CREATED,
      agent: 'ORCHESTRATOR',
      prospectId: 'p1',
      payload: { source: 'WEB_CHAT' },
    });

    expect(prisma.agentEvent.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'evt-1', persisted: true, createdAt: '2026-11-18T12:00:00.000Z' });
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('prospect.created');
  });

  it('on() ne livre que les types demandes', async () => {
    const { service } = makeService(
      vi
        .fn()
        .mockResolvedValueOnce(makeRow({ id: 'a', type: EVENT.PROSPECT_CREATED }))
        .mockResolvedValueOnce(makeRow({ id: 'b', type: EVENT.PROSPECT_QUALIFIED })),
    );
    const handler = vi.fn();
    service.on(EVENT.PROSPECT_QUALIFIED, handler);

    await service.emit({ type: EVENT.PROSPECT_CREATED, agent: 'ORCHESTRATOR' });
    await service.emit({ type: EVENT.PROSPECT_QUALIFIED, agent: 'QUALIFICATION' });
    await flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].id).toBe('b');
  });

  it('un handler qui plante ne bloque ni les autres handlers ni l\'emetteur', async () => {
    const { service } = makeService();
    const broken = vi.fn().mockRejectedValue(new Error('boom'));
    const healthy = vi.fn();
    service.on(EVENT.PROSPECT_CREATED, broken);
    service.on([EVENT.PROSPECT_CREATED], healthy);

    await expect(
      service.emit({ type: EVENT.PROSPECT_CREATED, agent: 'ORCHESTRATOR' }),
    ).resolves.toBeDefined();
    await flush();

    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('diffuse quand meme l\'evenement si la base est indisponible', async () => {
    const { service } = makeService(vi.fn().mockRejectedValue(new Error('db down')));
    const received: AgentEventMessage[] = [];
    service.stream().subscribe((e) => received.push(e));

    const result = await service.emit({ type: EVENT.STOCK_LOW, agent: 'INVENTORY', payload: { sku: 'SEALANT' } });

    expect(result.persisted).toBe(false);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(received).toEqual([result]);
  });

  it('recent() borne la limite entre 1 et 200 et filtre', async () => {
    const { service, prisma } = makeService();

    await service.recent({ limit: 9999, prospectId: 'p1', type: 'prospect.qualified' });
    await service.recent({ limit: -5 });

    const [first, second] = prisma.agentEvent.findMany.mock.calls.map((c) => c[0]);
    expect(first.take).toBe(200);
    expect(first.where).toEqual({ prospectId: 'p1', type: 'prospect.qualified' });
    expect(second.take).toBe(1);
    expect(second.where).toEqual({});
  });
});
