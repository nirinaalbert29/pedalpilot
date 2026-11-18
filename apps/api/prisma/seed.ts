/**
 * Seed de demonstration PedalPilot.
 * Objectif : le dashboard n'est JAMAIS vide quand le recruteur l'ouvre.
 * Deterministe (meme graine) et idempotent (on vide puis on recree).
 *
 * Lancer : pnpm db:seed
 */
import { randomUUID } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import pkg from '@prisma/client';
import type {
  AgentName,
  AppointmentType,
  Channel,
  MessageRole,
  Prisma,
  ProductCategory,
  ProspectStatus,
  Temperature,
  Urgency,
} from '@prisma/client';

const {
  PrismaClient,
  AppointmentStatus,
  FollowUpStatus,
  ReservationStatus,
  RunStatus,
  StockReason,
  UserRole,
} = pkg;

const prisma = new PrismaClient();

// ---------- Utilitaires ----------

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261118);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);

const NOW = new Date();
const HOUR = 3_600_000;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR);
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * HOUR);
const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ---------- Catalogue (atelier / boutique de velos) ----------

type ProductSeed = {
  sku: string;
  name: string;
  category: ProductCategory;
  priceEur: number;
  stock: number;
  reorderLevel: number;
};

const PRODUCTS: ProductSeed[] = [
  // Velos
  { sku: 'VAE-CITY', name: 'Velo electrique urbain Urbanix E5', category: 'BIKE', priceEur: 1990, stock: 4, reorderLevel: 2 },
  { sku: 'VAE-MTB', name: 'VTT electrique TrailBoost', category: 'BIKE', priceEur: 3290, stock: 2, reorderLevel: 1 },
  { sku: 'GRAVEL-ALU', name: 'Gravel Roam 300 alu', category: 'BIKE', priceEur: 1490, stock: 3, reorderLevel: 1 },
  { sku: 'ROAD-CARBON', name: 'Route Apex Carbon', category: 'BIKE', priceEur: 2890, stock: 1, reorderLevel: 1 },
  { sku: 'CITY-CLASSIC', name: 'Velo de ville Classic 7 vitesses', category: 'BIKE', priceEur: 590, stock: 6, reorderLevel: 2 },
  { sku: 'KIDS-20', name: 'Velo enfant 20 pouces', category: 'BIKE', priceEur: 249, stock: 5, reorderLevel: 2 },
  // Pieces
  { sku: 'PAD-DISC', name: 'Plaquettes de frein a disque (paire)', category: 'PART', priceEur: 22, stock: 18, reorderLevel: 8 },
  { sku: 'PAD-RIM', name: 'Patins de frein jante (paire)', category: 'PART', priceEur: 14, stock: 12, reorderLevel: 6 },
  { sku: 'CHAIN-11V', name: 'Chaine 11 vitesses', category: 'PART', priceEur: 34, stock: 0, reorderLevel: 5 },
  { sku: 'CHAIN-9V', name: 'Chaine 9 vitesses', category: 'PART', priceEur: 19, stock: 9, reorderLevel: 4 },
  { sku: 'CASSETTE-11V', name: 'Cassette 11 vitesses 11-34', category: 'PART', priceEur: 59, stock: 3, reorderLevel: 3 },
  { sku: 'TIRE-700-PROT', name: 'Pneu route 700x28 anti-crevaison', category: 'PART', priceEur: 38, stock: 14, reorderLevel: 6 },
  { sku: 'TIRE-29-TRAIL', name: 'Pneu VTT 29 pouces Trail', category: 'PART', priceEur: 42, stock: 2, reorderLevel: 4 },
  { sku: 'TUBE-700', name: 'Chambre a air 700c', category: 'PART', priceEur: 8, stock: 40, reorderLevel: 15 },
  { sku: 'BRAKE-CABLE', name: 'Cable de frein (lot)', category: 'PART', priceEur: 9, stock: 22, reorderLevel: 8 },
  { sku: 'BATTERY-500', name: 'Batterie velo electrique 500 Wh', category: 'PART', priceEur: 549, stock: 1, reorderLevel: 1 },
  { sku: 'DERAILLEUR-RD', name: 'Derailleur arriere 11 vitesses', category: 'PART', priceEur: 79, stock: 4, reorderLevel: 2 },
  // Accessoires
  { sku: 'HELMET-ADULT', name: 'Casque adulte Aero', category: 'ACCESSORY', priceEur: 59, stock: 10, reorderLevel: 4 },
  { sku: 'HELMET-KID', name: 'Casque enfant', category: 'ACCESSORY', priceEur: 39, stock: 7, reorderLevel: 3 },
  { sku: 'LOCK-U', name: 'Antivol en U renforce', category: 'ACCESSORY', priceEur: 45, stock: 11, reorderLevel: 4 },
  { sku: 'LIGHT-SET', name: 'Kit eclairage USB avant/arriere', category: 'ACCESSORY', priceEur: 29, stock: 15, reorderLevel: 6 },
  { sku: 'PUMP-FLOOR', name: 'Pompe a pied', category: 'ACCESSORY', priceEur: 24, stock: 6, reorderLevel: 3 },
  { sku: 'BOTTLE-CAGE', name: 'Porte-bidon aluminium', category: 'ACCESSORY', priceEur: 12, stock: 20, reorderLevel: 8 },
  // Consommables
  { sku: 'LUBE-CHAIN', name: 'Lubrifiant chaine 100 ml', category: 'CONSUMABLE', priceEur: 11, stock: 25, reorderLevel: 10 },
  { sku: 'SEALANT', name: 'Liquide preventif anti-crevaison', category: 'CONSUMABLE', priceEur: 13, stock: 3, reorderLevel: 6 },
];

// ---------- Scenarios de demandes entrantes ----------

type Scenario = {
  need: string;
  sku: string | null;
  type: AppointmentType;
  message: string;
  reply: string;
  budgetEur: number;
  urgency: Urgency;
  baseScore: number;
};

const SCENARIOS: Scenario[] = [
  {
    need: 'Reparation des freins a disque',
    sku: 'PAD-DISC',
    type: 'REPAIR',
    message: 'Bonjour, les freins a disque de mon VTT ne freinent plus bien, c\'est urgent pour ce week-end.',
    reply: 'Bonjour ! Je comprends l\'urgence. Je peux vous proposer un controle des freins avec remplacement des plaquettes. Quels creneaux vous arrangent ?',
    budgetEur: 60,
    urgency: 'HIGH',
    baseScore: 82,
  },
  {
    need: 'Achat d\'un velo electrique urbain',
    sku: 'VAE-CITY',
    type: 'PURCHASE',
    message: 'Je cherche un velo electrique pour aller au travail (12 km), budget autour de 2000 euros.',
    reply: 'Bonjour ! Nous avons l\'Urbanix E5 en stock, adapte a ce trajet. Souhaitez-vous l\'essayer en boutique ?',
    budgetEur: 2000,
    urgency: 'MEDIUM',
    baseScore: 88,
  },
  {
    need: 'Revision de la transmission',
    sku: 'CHAIN-11V',
    type: 'REPAIR',
    message: 'Ma chaine saute quand je change de vitesse, il me faudrait une revision de la transmission.',
    reply: 'Bonjour ! Il faudra probablement remplacer la chaine. Elle est momentanement en rupture, je vous propose un creneau apres reapprovisionnement.',
    budgetEur: 90,
    urgency: 'MEDIUM',
    baseScore: 64,
  },
  {
    need: 'Essai d\'un velo gravel',
    sku: 'GRAVEL-ALU',
    type: 'TEST_RIDE',
    message: 'Je voudrais essayer un velo gravel avant d\'acheter, vous avez quoi en stock ?',
    reply: 'Bonjour ! Nous avons le Gravel Roam 300 disponible a l\'essai. Je vous propose un creneau de 30 minutes.',
    budgetEur: 1500,
    urgency: 'MEDIUM',
    baseScore: 72,
  },
  {
    need: 'Pneus anti-crevaison pour la route',
    sku: 'TIRE-700-PROT',
    type: 'REPAIR',
    message: 'Crevaisons a repetition, je veux des pneus plus robustes pour rouler sur route.',
    reply: 'Bonjour ! Nous avons des pneus 700x28 anti-crevaison. Je peux vous les poser en 30 minutes, quand passez-vous ?',
    budgetEur: 80,
    urgency: 'LOW',
    baseScore: 55,
  },
  {
    need: 'Casque et antivol pour enfant',
    sku: 'HELMET-KID',
    type: 'PURCHASE',
    message: 'Il me faut un casque et un antivol pour mon fils de 12 ans, vous en avez ?',
    reply: 'Bonjour ! Oui, casque enfant et antivol renforce sont en stock. Passez quand vous voulez, ou je vous reserve les articles.',
    budgetEur: 90,
    urgency: 'LOW',
    baseScore: 46,
  },
  {
    need: 'Reglage de la position sur velo de route',
    sku: null,
    type: 'FITTING',
    message: 'J\'ai mal au dos sur mon velo de route, est-ce possible de faire un reglage de position ?',
    reply: 'Bonjour ! Oui, nous proposons un reglage de position d\'environ une heure. Je vous propose quelques creneaux.',
    budgetEur: 120,
    urgency: 'MEDIUM',
    baseScore: 58,
  },
];

// ---------- Prospects ----------

const FIRST_NAMES = [
  'Camille', 'Lucas', 'Emma', 'Hugo', 'Lea', 'Louis', 'Chloe', 'Nathan', 'Manon', 'Jules',
  'Sarah', 'Theo', 'Ines', 'Maxime', 'Jade', 'Antoine', 'Clara', 'Paul', 'Zoe', 'Adrien',
];
const LAST_NAMES = [
  'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau',
];

const PROSPECT_COUNT = 40;

function statusFor(i: number): ProspectStatus {
  if (i < 6) return 'APPOINTMENT_BOOKED';
  if (i < 10) return 'WON';
  if (i < 18) return 'QUALIFIED';
  if (i < 28) return 'FOLLOWING_UP';
  if (i < 34) return 'NEW';
  if (i < 38) return 'LOST';
  return 'QUALIFIED'; // 38, 39 : reprise humaine
}

const INACTIVITY_RANGES: Record<ProspectStatus, [number, number]> = {
  NEW: [0.3, 5],
  QUALIFIED: [3, 30],
  APPOINTMENT_BOOKED: [5, 35],
  FOLLOWING_UP: [50, 200],
  WON: [100, 300],
  LOST: [150, 400],
};

function inactivityHours(status: ProspectStatus): number {
  const [min, max] = INACTIVITY_RANGES[status];
  return between(min, max);
}

function temperatureFor(score: number): Temperature {
  if (score >= 70) return 'HOT';
  if (score >= 40) return 'WARM';
  return 'COLD';
}

function followUpText(first: string, s: Scenario, attempt: number): string {
  if (attempt === 1) {
    return `Bonjour ${first}, je reviens vers vous au sujet de votre demande (${s.need.toLowerCase()}). Souhaitez-vous que je vous propose un creneau cette semaine ?`;
  }
  return `Bonjour ${first}, derniere relance de ma part concernant ${s.need.toLowerCase()}. Votre piece reste reservee quelques jours si vous souhaitez passer a l'atelier.`;
}

// ---------- Programme principal ----------

async function main() {
  console.log('Nettoyage des tables...');
  await prisma.reservation.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.agentEvent.deleteMany();
  await prisma.prospect.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  // --- Utilisateur de demonstration (identifiants affiches sur la landing) ---
  await prisma.user.create({
    data: {
      email: 'demo@pedalpilot.dev',
      name: 'Compte demo',
      passwordHash: hashSync('demo1234', 10),
      role: UserRole.ADMIN,
    },
  });

  // --- Produits ---
  const productBySku = new Map<string, { id: string; priceEur: number; name: string }>();
  const inventory = new Map<string, number>(); // stock restant pendant le seed
  const productRows: Prisma.ProductCreateManyInput[] = PRODUCTS.map((p) => {
    const id = randomUUID();
    productBySku.set(p.sku, { id, priceEur: p.priceEur, name: p.name });
    inventory.set(p.sku, p.stock);
    return {
      id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      priceCents: p.priceEur * 100,
      stock: p.stock, // sera ajuste apres les reservations
      reorderLevel: p.reorderLevel,
    };
  });

  // --- Collecteurs ---
  const prospects: Prisma.ProspectCreateManyInput[] = [];
  const conversations: Prisma.ConversationCreateManyInput[] = [];
  const messages: Prisma.MessageCreateManyInput[] = [];
  const appointments: Prisma.AppointmentCreateManyInput[] = [];
  const reservations: Prisma.ReservationCreateManyInput[] = [];
  const followUps: Prisma.FollowUpCreateManyInput[] = [];
  const events: Prisma.AgentEventCreateManyInput[] = [];
  const runs: Prisma.AgentRunCreateManyInput[] = [];
  const movements: Prisma.StockMovementCreateManyInput[] = [];

  const ev = (
    type: string,
    agent: AgentName,
    prospectId: string,
    payload: unknown,
    at: Date,
  ) => events.push({ id: randomUUID(), type, agent, prospectId, payload: json(payload), createdAt: at });

  // Stock initial
  for (const p of PRODUCTS) {
    const prod = productBySku.get(p.sku)!;
    if (p.stock > 0) {
      movements.push({
        id: randomUUID(),
        productId: prod.id,
        delta: p.stock,
        reason: StockReason.RESTOCK,
        refType: 'manual',
        createdAt: hoursAgo(24 * 30),
      });
    }
  }

  // --- Boucle prospects ---
  for (let i = 0; i < PROSPECT_COUNT; i++) {
    const status = statusFor(i);
    const scenario = SCENARIOS[i % SCENARIOS.length];
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 7 + Math.floor(i / FIRST_NAMES.length)) % LAST_NAMES.length];
    const name = `${first} ${last}`;
    const channel: Channel = pick<Channel>(['WEB_CHAT', 'WEB_CHAT', 'WEB_CHAT', 'EMAIL', 'TELEGRAM']);
    const prospectId = randomUUID();
    const conversationId = randomUUID();

    const lastH = inactivityHours(status);
    const tLast = hoursAgo(lastH);
    const qualified = status !== 'NEW';
    const humanTakeover = i >= 38;

    // Score
    let score: number | null = null;
    if (qualified) {
      let s = scenario.baseScore + Math.round(between(-6, 6));
      if (status === 'WON') s += 10;
      if (status === 'FOLLOWING_UP') s -= 10;
      if (status === 'LOST') s -= 25;
      score = Math.max(5, Math.min(98, s));
    }

    // Stock : disponibilite au moment de la qualification
    const skuStock = scenario.sku ? (inventory.get(scenario.sku) ?? 0) : null;
    const outOfStock = scenario.sku !== null && skuStock === 0;
    const reasonParts = [
      scenario.need,
      `urgence ${scenario.urgency.toLowerCase()}`,
      `budget annonce ~${scenario.budgetEur} EUR`,
    ];
    if (scenario.sku) {
      reasonParts.push(
        outOfStock
          ? `piece ${scenario.sku} en rupture (commande fournisseur necessaire)`
          : `piece ${scenario.sku} disponible en stock`,
      );
    }

    prospects.push({
      id: prospectId,
      name,
      email: `${slug(first)}.${slug(last)}${i}@example.com`,
      phone: `+336${String(Math.floor(10_000_000 + rand() * 89_999_999))}`,
      telegramChatId: channel === 'TELEGRAM' ? String(100_000_000 + i) : null,
      source: channel === 'WEB_CHAT' ? 'landing_chat' : channel === 'EMAIL' ? 'email' : 'telegram',
      status,
      score,
      temperature: score !== null ? temperatureFor(score) : null,
      need: qualified ? scenario.need : null,
      budgetEur: qualified ? scenario.budgetEur : null,
      urgency: qualified ? scenario.urgency : null,
      reason: qualified ? reasonParts.join(' ; ') : null,
      humanTakeover,
      lastActivityAt: tLast,
      createdAt: hoursAgo(lastH + 0.4 + (status === 'WON' ? 24 : 0)),
    });

    conversations.push({
      id: conversationId,
      prospectId,
      channel,
      createdAt: minutes(tLast, -20),
    });

    // --- Messages ---
    const addMsg = (role: MessageRole, content: string, at: Date) =>
      messages.push({ id: randomUUID(), conversationId, role, content, createdAt: at });

    const t1 = status === 'NEW' ? tLast : minutes(tLast, -20);
    addMsg('PROSPECT', scenario.message, t1);
    ev('prospect.created', 'ORCHESTRATOR', prospectId, { source: channel, name }, t1);

    if (qualified) {
      addMsg('AGENT', scenario.reply, minutes(tLast, -19));

      // Execution de l'agent de qualification
      const fallback = i % 11 === 3;
      const durationMs = Math.round(between(900, 2600));
      runs.push({
        id: randomUUID(),
        agent: 'QUALIFICATION',
        prospectId,
        status: fallback ? RunStatus.FALLBACK : RunStatus.SUCCESS,
        input: json({ message: scenario.message, channel }),
        output: json({
          need: scenario.need,
          product: scenario.sku,
          budgetEur: scenario.budgetEur,
          urgency: scenario.urgency,
          score,
          temperature: temperatureFor(score!),
        }),
        durationMs,
        error: fallback ? 'LLM timeout, qualification par regles de repli' : null,
        createdAt: minutes(tLast, -19.5),
      });
      ev(
        'prospect.qualified',
        'QUALIFICATION',
        prospectId,
        { score, temperature: temperatureFor(score!), need: scenario.need, fallback },
        minutes(tLast, -19.4),
      );

      if (outOfStock) {
        ev('stock.unavailable', 'INVENTORY', prospectId, { sku: scenario.sku }, minutes(tLast, -19.3));
      }
    }

    // --- Rendez-vous + reservation de piece ---
    if (status === 'APPOINTMENT_BOOKED' || status === 'WON') {
      const appointmentId = randomUUID();
      const durationMin = scenario.type === 'FITTING' ? 60 : scenario.type === 'REPAIR' ? 45 : 30;
      let startsAt: Date;
      if (status === 'APPOINTMENT_BOOKED') {
        startsAt = new Date(NOW.getTime() + (1 + (i % 4)) * 24 * HOUR);
        startsAt.setUTCHours(6 + (i % 7), 0, 0, 0); // 9h-15h heure d'Antananarivo
      } else {
        startsAt = hoursAgo(Math.max(lastH - 20, 4));
        startsAt.setUTCMinutes(0, 0, 0);
      }
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      const product = scenario.sku ? productBySku.get(scenario.sku)! : null;

      appointments.push({
        id: appointmentId,
        prospectId,
        productId: product?.id ?? null,
        type: scenario.type,
        status: status === 'WON' ? AppointmentStatus.COMPLETED : AppointmentStatus.CONFIRMED,
        startsAt,
        endsAt,
        googleEventId: null,
        notes: 'Donnee de demonstration',
        emailSentAt: minutes(tLast, -3),
        cancelToken: randomUUID(),
        createdAt: minutes(tLast, -4),
      });

      addMsg('PROSPECT', 'Le creneau propose me convient, merci !', minutes(tLast, -5));
      addMsg('AGENT', 'Parfait, votre rendez-vous est confirme. Un recapitulatif vient de vous etre envoye par e-mail.', tLast);

      runs.push({
        id: randomUUID(),
        agent: 'SCHEDULING',
        prospectId,
        status: RunStatus.SUCCESS,
        input: json({ type: scenario.type, proposedSlots: 3 }),
        output: json({ appointmentId, startsAt: startsAt.toISOString(), emailSent: true }),
        durationMs: Math.round(between(1200, 3400)),
        error: null,
        createdAt: minutes(tLast, -4),
      });
      ev(
        'appointment.booked',
        'SCHEDULING',
        prospectId,
        { appointmentId, type: scenario.type, startsAt: startsAt.toISOString() },
        minutes(tLast, -4),
      );

      // Reservation de la piece si disponible
      if (product && scenario.sku && (inventory.get(scenario.sku) ?? 0) > 0) {
        const reservationId = randomUUID();
        inventory.set(scenario.sku, (inventory.get(scenario.sku) ?? 0) - 1);
        reservations.push({
          id: reservationId,
          productId: product.id,
          prospectId,
          appointmentId,
          quantity: 1,
          status: status === 'WON' ? ReservationStatus.FULFILLED : ReservationStatus.ACTIVE,
          expiresAt: status === 'WON' ? null : new Date(startsAt.getTime() + 24 * HOUR),
          createdAt: minutes(tLast, -3.9),
        });
        movements.push({
          id: randomUUID(),
          productId: product.id,
          delta: -1,
          reason: StockReason.RESERVATION,
          refType: 'reservation',
          refId: reservationId,
          createdAt: minutes(tLast, -3.9),
        });
        ev(
          'stock.reserved',
          'INVENTORY',
          prospectId,
          { sku: scenario.sku, quantity: 1, reservationId },
          minutes(tLast, -3.9),
        );
      }
    }

    // --- Perdu ---
    if (status === 'LOST') {
      addMsg('PROSPECT', 'Finalement je vais attendre, merci quand meme.', tLast);
      ev('prospect.lost', 'ORCHESTRATOR', prospectId, { reason: 'declined' }, tLast);
    }

    // --- Relances (prospects inactifs) ---
    if (status === 'FOLLOWING_UP') {
      if (lastH > 96) {
        const sentAt = hoursAgo(lastH - 48);
        const fuChannel: Channel = channel === 'TELEGRAM' ? 'TELEGRAM' : 'EMAIL';
        const content = followUpText(first, scenario, 1);
        followUps.push({
          id: randomUUID(),
          prospectId,
          channel: fuChannel,
          content,
          status: FollowUpStatus.SENT,
          attempt: 1,
          scheduledFor: sentAt,
          sentAt,
          createdAt: minutes(sentAt, -1),
        });
        addMsg('AGENT', content, sentAt);
        runs.push({
          id: randomUUID(),
          agent: 'FOLLOWUP',
          prospectId,
          status: RunStatus.SUCCESS,
          input: json({ inactiveHours: 48, attempt: 1 }),
          output: json({ channel: fuChannel, sent: true }),
          durationMs: Math.round(between(700, 1800)),
          error: null,
          createdAt: minutes(sentAt, -1),
        });
        ev('followup.sent', 'FOLLOWUP', prospectId, { channel: fuChannel, attempt: 1 }, sentAt);

        followUps.push({
          id: randomUUID(),
          prospectId,
          channel: fuChannel === 'EMAIL' ? 'TELEGRAM' : 'EMAIL',
          content: followUpText(first, scenario, 2),
          status: FollowUpStatus.SCHEDULED,
          attempt: 2,
          scheduledFor: hoursFromNow(between(2, 22)),
          createdAt: sentAt,
        });
      } else {
        // Premiere relance bientot due : parfait pour la demo "Accelerer le temps"
        followUps.push({
          id: randomUUID(),
          prospectId,
          channel: channel === 'TELEGRAM' ? 'TELEGRAM' : 'EMAIL',
          content: followUpText(first, scenario, 1),
          status: FollowUpStatus.SCHEDULED,
          attempt: 1,
          scheduledFor: hoursFromNow(between(0.2, 3)),
          createdAt: NOW,
        });
      }
    }

    if (humanTakeover) {
      addMsg('SYSTEM', 'Un conseiller a pris la main sur cette conversation. Les agents sont en pause.', minutes(tLast, 1));
      ev('conversation.human_takeover', 'ORCHESTRATOR', prospectId, { by: 'demo@pedalpilot.dev' }, minutes(tLast, 1));
    }
  }

  // --- Quelques ventes directes en boutique (mouvements SALE) ---
  for (const [sku, qty] of [
    ['TUBE-700', 6],
    ['LUBE-CHAIN', 4],
    ['LIGHT-SET', 3],
    ['PAD-DISC', 5],
    ['HELMET-ADULT', 2],
  ] as Array<[string, number]>) {
    const prod = productBySku.get(sku)!;
    inventory.set(sku, Math.max(0, (inventory.get(sku) ?? 0) - qty));
    movements.push({
      id: randomUUID(),
      productId: prod.id,
      delta: -qty,
      reason: StockReason.SALE,
      refType: 'manual',
      createdAt: hoursAgo(between(10, 200)),
    });
  }

  // Le stock final = ce qui reste apres reservations et ventes
  for (const row of productRows) {
    const sku = row.sku;
    row.stock = inventory.get(sku) ?? 0;
  }

  // --- Ecriture en base (ordre des dependances) ---
  console.log('Insertion...');
  await prisma.product.createMany({ data: productRows });
  await prisma.stockMovement.createMany({ data: movements });
  await prisma.prospect.createMany({ data: prospects });
  await prisma.conversation.createMany({ data: conversations });
  await prisma.message.createMany({ data: messages });
  await prisma.appointment.createMany({ data: appointments });
  await prisma.reservation.createMany({ data: reservations });
  await prisma.followUp.createMany({ data: followUps });
  await prisma.agentEvent.createMany({ data: events });
  await prisma.agentRun.createMany({ data: runs });

  console.log(
    `Seed termine : ${productRows.length} produits, ${prospects.length} prospects, ` +
      `${messages.length} messages, ${appointments.length} rendez-vous, ` +
      `${reservations.length} reservations, ${followUps.length} relances, ` +
      `${events.length} evenements, ${runs.length} executions d'agents.`,
  );
  console.log('Compte demo : demo@pedalpilot.dev / demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
