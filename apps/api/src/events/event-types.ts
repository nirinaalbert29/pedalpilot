/**
 * Catalogue des evenements du systeme.
 * C'est le "langage commun" entre les agents : chacun emet et ecoute ces evenements.
 * Les noms existants correspondent a ceux du seed (AgentEvent.type).
 */
export const EVENT = {
  // Prospects
  PROSPECT_CREATED: 'prospect.created',
  PROSPECT_QUALIFIED: 'prospect.qualified',
  PROSPECT_LOST: 'prospect.lost',

  // Conversations
  CONVERSATION_MESSAGE: 'conversation.message',
  CONVERSATION_HUMAN_TAKEOVER: 'conversation.human_takeover',
  CONVERSATION_HUMAN_RELEASED: 'conversation.human_released',

  // Rendez-vous
  APPOINTMENT_BOOKED: 'appointment.booked',
  APPOINTMENT_PROPOSED: 'appointment.proposed',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  APPOINTMENT_COMPLETED: 'appointment.completed',

  // Stock
  STOCK_RESERVED: 'stock.reserved',
  STOCK_UNAVAILABLE: 'stock.unavailable',
  STOCK_LOW: 'stock.low',

  // Relances
  FOLLOWUP_SENT: 'followup.sent',
  FOLLOWUP_SCHEDULED: 'followup.scheduled',
  FOLLOWUP_CANCELLED: 'followup.cancelled',
  FOLLOWUP_FAILED: 'followup.failed',
  STOCK_MOVED: 'stock.moved',

  // Systeme
  TIME_ACCELERATED: 'time.accelerated',
  SYSTEM_TEST: 'system.test',
} as const;

export type EventType = (typeof EVENT)[keyof typeof EVENT];
