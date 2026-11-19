import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProspectStatus, Temperature } from '@prisma/client';
import { EventsService } from '../events/events.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
}
