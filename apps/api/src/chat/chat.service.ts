import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { EVENT } from '../events/event-types.js';
import { QualificationService } from '../qualification/qualification.service.js';
import type { ChatResponse } from '../qualification/qualification.service.js';

export interface ChatRequest {
  message: string;
  name?: string;
  email?: string;
  prospectId?: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly qualification: QualificationService,
  ) {}

  async send(input: ChatRequest): Promise<ChatResponse> {
    const message =
      typeof input.message === 'string' ? input.message.trim() : '';
    if (!message || message.length > 2000) {
      throw new BadRequestException(
        'Le message doit contenir entre 1 et 2000 caractères.',
      );
    }
    const name =
      typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
    const email =
      typeof input.email === 'string'
        ? input.email.trim().toLowerCase().slice(0, 254)
        : '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Adresse e-mail invalide.');
    }

    const existing = input.prospectId
      ? await this.prisma.prospect.findUnique({
          where: { id: input.prospectId },
          include: {
            conversations: {
              where: { channel: 'WEB_CHAT' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        })
      : email
        ? await this.prisma.prospect.findUnique({
            where: { email },
            include: {
              conversations: {
                where: { channel: 'WEB_CHAT' },
                orderBy: { updatedAt: 'desc' },
                take: 1,
              },
            },
          })
        : null;
    if (input.prospectId && !existing)
      throw new NotFoundException('Prospect introuvable.');

    const isNew = !existing;
    let prospectId: string;
    let conversationId: string;
    if (existing) {
      prospectId = existing.id;
      let conversation = existing.conversations[0];
      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: { prospectId, channel: 'WEB_CHAT' },
        });
      }
      conversationId = conversation.id;
    } else {
      const prospect = await this.prisma.prospect.create({
        data: {
          name: name || 'Nouveau prospect',
          ...(email ? { email } : {}),
          source: 'landing_chat',
          conversations: { create: { channel: 'WEB_CHAT' } },
        },
        include: { conversations: true },
      });
      prospectId = prospect.id;
      conversationId = prospect.conversations[0].id;
    }

    const userMessage = await this.prisma.message.create({
      data: { conversationId, role: 'PROSPECT', content: message },
    });
    await this.prisma.prospect.update({
      where: { id: prospectId },
      data: { lastActivityAt: new Date() },
    });
    if (isNew) {
      await this.events.emit({
        type: EVENT.PROSPECT_CREATED,
        agent: 'ORCHESTRATOR',
        prospectId,
        payload: { source: 'WEB_CHAT', name: name || 'Nouveau prospect' },
      });
    }

    return this.qualification.submit({
      messageId: userMessage.id,
      conversationId,
      prospectId,
    });
  }
}
