import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { AgentName, Prisma, Temperature, Urgency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import type {
  AgentEventMessage,
  EventHandler,
} from '../events/events.service.js';
import { EVENT } from '../events/event-types.js';
import { LlmService } from '../ai/llm.service.js';

export interface ChatResponse {
  prospectId: string;
  conversationId: string;
  reply: string;
  mode: 'ai' | 'fallback' | 'human';
  qualification: {
    score: number | null;
    temperature: Temperature | null;
    need: string | null;
    budgetEur: number | null;
    urgency: Urgency | null;
  };
}

interface InventoryItem {
  sku: string;
  name: string;
  category: string;
  stock: number;
  priceCents: number;
}

interface Qualification {
  reply: string;
  need: string | null;
  budgetEur: number | null;
  urgency: Urgency | null;
  score: number;
  productSku: string | null;
  reason: string;
}

interface PendingReply {
  resolve: (response: ChatResponse) => void;
  timer: ReturnType<typeof setTimeout>;
}

function objectFromJson(text: string): Record<string, unknown> | null {
  const clean = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    const value: unknown = JSON.parse(clean);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validUrgency(value: unknown): Urgency | null {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH'
    ? value
    : null;
}

@Injectable()
export class QualificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QualificationService.name);
  private readonly pending = new Map<string, PendingReply>();
  private subscription?: { unsubscribe(): void };

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly llm: LlmService,
  ) {}

  onModuleInit(): void {
    const handler: EventHandler = async (event) =>
      this.handleConversationEvent(event);
    this.subscription = this.events.on(EVENT.CONVERSATION_MESSAGE, handler);
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
  }

  /** Publie le message entrant sur le bus et attend la réponse de l'agent abonné. */
  async submit(input: {
    messageId: string;
    conversationId: string;
    prospectId: string;
  }): Promise<ChatResponse> {
    const result = new Promise<ChatResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(input.messageId);
        resolve({
          prospectId: input.prospectId,
          conversationId: input.conversationId,
          reply:
            'Merci pour votre message. Un conseiller va vous répondre dès que possible.',
          mode: 'fallback',
          qualification: {
            score: null,
            temperature: null,
            need: null,
            budgetEur: null,
            urgency: null,
          },
        });
      }, 25_000);
      this.pending.set(input.messageId, { resolve, timer });
    });

    await this.events.emit({
      type: EVENT.CONVERSATION_MESSAGE,
      agent: 'ORCHESTRATOR',
      prospectId: input.prospectId,
      payload: {
        role: 'PROSPECT',
        messageId: input.messageId,
        conversationId: input.conversationId,
      },
    });
    return result;
  }

  private async handleConversationEvent(
    event: AgentEventMessage,
  ): Promise<void> {
    const messageId =
      typeof event.payload.messageId === 'string'
        ? event.payload.messageId
        : null;
    if (event.payload.role !== 'PROSPECT' || !messageId) return;

    const pending = this.pending.get(messageId);
    if (!pending) return;
    try {
      const response = await this.qualify(messageId, event);
      clearTimeout(pending.timer);
      this.pending.delete(messageId);
      pending.resolve(response);
    } catch (error) {
      this.logger.error(
        `Qualification impossible pour ${event.prospectId ?? 'prospect inconnu'}: ${error instanceof Error ? error.message : String(error)}`,
      );
      clearTimeout(pending.timer);
      this.pending.delete(messageId);
      pending.resolve({
        prospectId: event.prospectId ?? '',
        conversationId:
          typeof event.payload.conversationId === 'string'
            ? event.payload.conversationId
            : '',
        reply:
          'Merci pour votre message. Pouvez-vous nous en dire un peu plus sur votre besoin ? Un conseiller pourra aussi vous aider.',
        mode: 'fallback',
        qualification: {
          score: null,
          temperature: null,
          need: null,
          budgetEur: null,
          urgency: null,
        },
      });
    }
  }

  private async qualify(
    messageId: string,
    event: AgentEventMessage,
  ): Promise<ChatResponse> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { prospect: true } } },
    });
    if (!message) throw new Error('Message entrant introuvable');

    const { conversation } = message;
    const prospect = conversation.prospect;
    if (prospect.humanTakeover) {
      return {
        prospectId: prospect.id,
        conversationId: conversation.id,
        reply:
          'Votre message a bien été transmis à notre conseiller, qui vous répondra dès que possible.',
        mode: 'human',
        qualification: {
          score: prospect.score,
          temperature: prospect.temperature,
          need: prospect.need,
          budgetEur: prospect.budgetEur,
          urgency: prospect.urgency,
        },
      };
    }

    const [inventory, history] = await Promise.all([
      this.prisma.product.findMany({
        where: { active: true },
        select: {
          sku: true,
          name: true,
          category: true,
          stock: true,
          priceCents: true,
        },
        orderBy: { name: 'asc' },
        take: 100,
      }),
      this.prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);
    const orderedHistory = history.reverse();
    const generated = await this.generate(
      message.content,
      orderedHistory,
      inventory,
    );
    const mode: 'ai' | 'fallback' = generated ? 'ai' : 'fallback';
    const qualification =
      generated ?? this.fallback(message.content, inventory, prospect.name);
    const temperature: Temperature =
      qualification.score >= 75
        ? 'HOT'
        : qualification.score >= 45
          ? 'WARM'
          : 'COLD';
    const validSku =
      qualification.productSku &&
      inventory.some(
        (product) =>
          product.sku === qualification.productSku && product.stock > 0,
      )
        ? qualification.productSku
        : null;
    const reply = qualification.reply.slice(0, 1200);
    const durationMs = Math.max(
      0,
      Date.now() - new Date(message.createdAt).getTime(),
    );

    await this.prisma.$transaction([
      this.prisma.prospect.update({
        where: { id: prospect.id },
        data: {
          status: 'QUALIFIED',
          score: qualification.score,
          temperature,
          need: qualification.need,
          budgetEur: qualification.budgetEur,
          urgency: qualification.urgency,
          reason: qualification.reason.slice(0, 500),
          lastActivityAt: new Date(),
        },
      }),
      this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'AGENT',
          content: reply,
        },
      }),
      this.prisma.agentRun.create({
        data: {
          agent: 'QUALIFICATION' as AgentName,
          prospectId: prospect.id,
          status: mode === 'ai' ? 'SUCCESS' : 'FALLBACK',
          input: {
            message: message.content,
            inventoryCount: inventory.length,
          } as Prisma.InputJsonValue,
          output: {
            reply,
            need: qualification.need,
            budgetEur: qualification.budgetEur,
            urgency: qualification.urgency,
            score: qualification.score,
            temperature,
            productSku: validSku,
            mode,
          } as Prisma.InputJsonValue,
          durationMs,
        },
      }),
    ]);

    const payload = {
      score: qualification.score,
      temperature,
      need: qualification.need,
      budgetEur: qualification.budgetEur,
      urgency: qualification.urgency,
      productSku: validSku,
      mode,
    };
    await this.events.emit({
      type: EVENT.PROSPECT_QUALIFIED,
      agent: 'QUALIFICATION',
      prospectId: prospect.id,
      payload,
    });
    await this.events.emit({
      type: EVENT.CONVERSATION_MESSAGE,
      agent: 'QUALIFICATION',
      prospectId: prospect.id,
      payload: { role: 'AGENT', conversationId: conversation.id },
    });

    return {
      prospectId: prospect.id,
      conversationId: conversation.id,
      reply,
      mode,
      qualification: {
        score: qualification.score,
        temperature,
        need: qualification.need,
        budgetEur: qualification.budgetEur,
        urgency: qualification.urgency,
      },
    };
  }

  private async generate(
    currentMessage: string,
    history: Array<{ role: string; content: string }>,
    inventory: InventoryItem[],
  ): Promise<Qualification | null> {
    const catalog = inventory.map((product) => ({
      sku: product.sku,
      name: product.name,
      category: product.category,
      availableUnits: product.stock,
      priceEur: product.priceCents / 100,
    }));
    const transcript = history
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n');
    const system = [
      'Tu es le conseiller commercial de PedalPilot, un atelier et magasin de vélos. Réponds uniquement en français, naturellement et brièvement.',
      'Aide à comprendre le besoin et pose au plus une question utile. Ne confirme jamais un rendez-vous ni une réservation.',
      'Le catalogue JSON ci-dessous est la seule source de vérité sur les produits et stocks. Ne prétends pas qu’un article est disponible s’il n’y figure pas avec availableUnits supérieur à zéro.',
      'Évalue le prospect sans inventer d’informations. Score entier de 0 à 100; need est une courte description; budgetEur entier ou null; urgency vaut LOW, MEDIUM, HIGH ou null.',
      'Retourne uniquement un objet JSON avec reply, need, budgetEur, urgency, score, productSku, reason. productSku doit être un SKU du catalogue ou null.',
      `CATALOGUE=${JSON.stringify(catalog)}`,
    ].join('\n');
    const raw = await this.llm.complete(
      system,
      `Historique récent:\n${transcript}\n\nNouveau message: ${currentMessage}`,
    );
    if (!raw) return null;
    const value = objectFromJson(raw);
    if (!value || typeof value.reply !== 'string' || !value.reply.trim())
      return null;

    const score =
      typeof value.score === 'number' && Number.isFinite(value.score)
        ? Math.max(0, Math.min(100, Math.round(value.score)))
        : 40;
    const budget =
      typeof value.budgetEur === 'number' && Number.isFinite(value.budgetEur)
        ? Math.max(0, Math.round(value.budgetEur))
        : null;
    const sku =
      typeof value.productSku === 'string' &&
      inventory.some(
        (product) => product.sku === value.productSku && product.stock > 0,
      )
        ? value.productSku
        : null;
    return {
      reply: value.reply.trim(),
      need:
        typeof value.need === 'string'
          ? value.need.trim().slice(0, 200) || null
          : null,
      budgetEur: budget,
      urgency: validUrgency(value.urgency),
      score,
      productSku: sku,
      reason:
        typeof value.reason === 'string'
          ? value.reason.trim().slice(0, 500)
          : 'Qualification assistée par IA.',
    };
  }

  private fallback(
    message: string,
    inventory: InventoryItem[],
    prospectName: string,
  ): Qualification {
    const text = message.toLocaleLowerCase('fr');
    const amount =
      text.match(/(?:\b|\s)(\d{2,5})\s*(?:€|euros?|eur)\b/i) ??
      text.match(/\b(?:budget|environ|autour de)\s*(\d{2,5})\b/i);
    const budgetEur = amount ? Number.parseInt(amount[1], 10) : null;
    const urgency: Urgency | null =
      /urgent|rapidement|demain|aujourd'hui|cette semaine/.test(text)
        ? 'HIGH'
        : /bient[oô]t|prochain|semaine prochaine/.test(text)
          ? 'MEDIUM'
          : null;
    const need = /r[eé]par|pneu|frein|r[eé]vision|crevaison/.test(text)
      ? 'Réparation ou entretien de vélo'
      : /gravel/.test(text)
        ? 'Recherche d’un vélo gravel'
        : /v[eé]lo|vtt|route|cargo|[eé]lectrique/.test(text)
          ? 'Recherche ou conseil autour d’un vélo'
          : null;
    const product = inventory.find(
      (item) =>
        item.stock > 0 &&
        (text.includes(item.sku.toLocaleLowerCase('fr')) ||
          item.name
            .toLocaleLowerCase('fr')
            .split(/\s+/)
            .some((part) => part.length > 4 && text.includes(part)) ||
          (need?.includes('vélo') && item.category === 'BIKE')),
    );
    const score = Math.min(
      90,
      30 +
        (need ? 20 : 0) +
        (budgetEur ? 20 : 0) +
        (urgency ? 15 : 0) +
        (message.trim().length > 40 ? 5 : 0),
    );
    const firstName = prospectName.trim().split(/\s+/)[0];
    const greeting = firstName ? `Bonjour ${firstName}, ` : 'Bonjour, ';
    const productText = product
      ? ` Le ${product.name} est actuellement en stock (${product.stock} disponible${product.stock > 1 ? 's' : ''}) à ${(product.priceCents / 100).toFixed(2)} €.`
      : '';
    const question = budgetEur
      ? 'Pour mieux vous orienter, quel type de trajet ou de pratique avez-vous en tête ?'
      : 'Quel budget souhaitez-vous prévoir et pour quel usage ?';
    return {
      reply: `${greeting}je peux vous aider à trouver la bonne solution.${productText} ${question}`,
      need,
      budgetEur,
      urgency,
      score,
      productSku: product?.sku ?? null,
      reason:
        'Estimation déterministe à partir du message; fournisseur IA absent ou indisponible.',
    };
  }
}
