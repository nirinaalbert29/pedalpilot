import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProspectStatus, Temperature } from '@prisma/client';
import { EventsService } from '../events/events.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FollowupsService } from '../followups/followups.service.js';

const statuses = new Set<ProspectStatus>([
  'NEW',
  'QUALIFIED',
  'APPOINTMENT_BOOKED',
  'FOLLOWING_UP',
  'WON',
  'LOST',
]);
const temperatures = new Set<Temperature>(['HOT', 'WARM', 'COLD']);

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly followupAutomation: FollowupsService,
  ) {}

  async summary() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const [total, hot, newThisWeek, qualified, products, recentEvents] =
      await Promise.all([
        this.prisma.prospect.count(),
        this.prisma.prospect.count({ where: { temperature: 'HOT' } }),
        this.prisma.prospect.count({
          where: { createdAt: { gte: weekAgo } },
        }),
        this.prisma.prospect.count({ where: { status: 'QUALIFIED' } }),
        this.prisma.product.findMany({
          where: { active: true },
          select: { stock: true, reorderLevel: true },
        }),
        this.events.recent({ limit: 10 }),
      ]);

    return {
      prospects: total,
      hotProspects: hot,
      newThisWeek,
      qualified,
      lowStock: products.filter((product) => product.stock <= product.reorderLevel)
        .length,
      recentEvents,
    };
  }

  async prospects(status?: string, query?: string, temperature?: string) {
    const normalizedStatus = status?.trim().toUpperCase();
    const normalizedTemperature = temperature?.trim().toUpperCase();
    const where = {
      ...(normalizedStatus && normalizedStatus !== 'ALL' &&
      statuses.has(normalizedStatus as ProspectStatus)
        ? { status: normalizedStatus as ProspectStatus }
        : {}),
      ...(normalizedTemperature &&
      temperatures.has(normalizedTemperature as Temperature)
        ? { temperature: normalizedTemperature as Temperature }
        : {}),
      ...(query?.trim()
        ? {
            OR: [
              { name: { contains: query.trim(), mode: 'insensitive' as const } },
              { email: { contains: query.trim(), mode: 'insensitive' as const } },
              { need: { contains: query.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    return this.prisma.prospect.findMany({
      where,
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        source: true,
        status: true,
        score: true,
        temperature: true,
        need: true,
        budgetEur: true,
        urgency: true,
        humanTakeover: true,
        lastActivityAt: true,
        createdAt: true,
        conversations: {
          where: { channel: 'WEB_CHAT' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { content: true, role: true, createdAt: true },
            },
          },
        },
      },
    });
  }

  async prospect(id: string) {
    const prospect = await this.prisma.prospect.findUnique({
      where: { id },
      include: {
        conversations: {
          where: { channel: 'WEB_CHAT' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: {
            messages: { orderBy: { createdAt: 'asc' }, take: 100 },
          },
        },
        events: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!prospect) throw new NotFoundException('Prospect introuvable.');
    return prospect;
  }

  products() {
    return this.prisma.product.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, sku: true, name: true, category: true, priceCents: true, stock: true, reorderLevel: true },
    });
  }

  followups(prospectId?: string) {
    return this.followupAutomation.list(prospectId);
  }

  retryFollowup(id: string) {
    return this.followupAutomation.retry(id);
  }

  async setHumanTakeover(id: string, enabled: boolean) {
    const prospect = await this.prisma.prospect.findUnique({ where: { id }, select: { id: true, humanTakeover: true } });
    if (!prospect) throw new NotFoundException('Prospect introuvable.');
    if (prospect.humanTakeover === enabled) return { id, humanTakeover: enabled };
    await this.prisma.prospect.update({ where: { id }, data: { humanTakeover: enabled } });
    if (enabled) await this.followupAutomation.cancelForProspect(id, 'human_takeover');
    await this.events.emit({
      type: enabled ? 'conversation.human_takeover' : 'conversation.human_released',
      agent: 'ORCHESTRATOR',
      prospectId: id,
      payload: { by: 'dashboard' },
    });
    return { id, humanTakeover: enabled };
  }

  async moveStock(id: string, input: { reason?: string; quantity?: number; delta?: number }) {
    const reason = typeof input.reason === 'string' ? input.reason.toUpperCase() : '';
    const quantity = Number(input.quantity);
    if (!['RESTOCK', 'SALE', 'ADJUSTMENT'].includes(reason ?? '')) {
      throw new BadRequestException('reason doit être RESTOCK, SALE ou ADJUSTMENT.');
    }
    const delta = reason === 'RESTOCK' ? quantity : reason === 'SALE' ? -quantity : Number(input.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000 || ((reason === 'RESTOCK' || reason === 'SALE') && (!Number.isInteger(quantity) || quantity < 1))) {
      throw new BadRequestException('La quantité doit être un entier valide et non nul.');
    }
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true, sku: true, name: true, stock: true, reorderLevel: true, active: true } });
    if (!product || !product.active) throw new NotFoundException('Produit introuvable ou inactif.');
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.product.updateMany({
        where: { id, active: true, ...(delta < 0 ? { stock: { gte: -delta } } : {}) },
        data: { stock: { increment: delta } },
      });
      if (!changed.count) throw new ConflictException('Stock insuffisant pour cette opération.');
      await tx.stockMovement.create({ data: { productId: id, delta, reason: reason as 'RESTOCK' | 'SALE' | 'ADJUSTMENT', refType: 'DASHBOARD' } });
      return tx.product.findUniqueOrThrow({ where: { id }, select: { id: true, sku: true, name: true, stock: true, reorderLevel: true } });
    });
    await this.events.emit({ type: 'stock.moved', agent: 'INVENTORY', payload: { productId: id, sku: product.sku, name: product.name, delta, reason, stock: result.stock } });
    if (result.stock <= result.reorderLevel) {
      await this.events.emit({ type: 'stock.low', agent: 'INVENTORY', payload: { productId: id, sku: product.sku, name: product.name, stock: result.stock, reorderLevel: result.reorderLevel } });
    }
    return result;
  }
}
