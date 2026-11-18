-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'QUALIFIED', 'APPOINTMENT_BOOKED', 'FOLLOWING_UP', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "Temperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WEB_CHAT', 'EMAIL', 'TELEGRAM', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('PROSPECT', 'AGENT', 'HUMAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('REPAIR', 'TEST_RIDE', 'PURCHASE', 'FITTING');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('BIKE', 'PART', 'ACCESSORY', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "StockReason" AS ENUM ('RESTOCK', 'RESERVATION', 'RELEASE', 'SALE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentName" AS ENUM ('ORCHESTRATOR', 'QUALIFICATION', 'SCHEDULING', 'FOLLOWUP', 'INVENTORY');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('SUCCESS', 'FALLBACK', 'ERROR');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "telegramChatId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'landing_chat',
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "temperature" "Temperature",
    "need" TEXT,
    "budgetEur" INTEGER,
    "urgency" "Urgency",
    "reason" TEXT,
    "humanTakeover" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'WEB_CHAT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "productId" TEXT,
    "type" "AppointmentType" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "googleEventId" TEXT,
    "notes" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "cancelToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "StockReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agent" "AgentName" NOT NULL,
    "prospectId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agent" "AgentName" NOT NULL,
    "prospectId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'SUCCESS',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_email_key" ON "Prospect"("email");

-- CreateIndex
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");

-- CreateIndex
CREATE INDEX "Prospect_lastActivityAt_idx" ON "Prospect"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Prospect_temperature_idx" ON "Prospect"("temperature");

-- CreateIndex
CREATE INDEX "Conversation_prospectId_idx" ON "Conversation"("prospectId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_cancelToken_key" ON "Appointment"("cancelToken");

-- CreateIndex
CREATE INDEX "Appointment_startsAt_idx" ON "Appointment"("startsAt");

-- CreateIndex
CREATE INDEX "Appointment_prospectId_idx" ON "Appointment"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_prospectId_idx" ON "Reservation"("prospectId");

-- CreateIndex
CREATE INDEX "FollowUp_status_scheduledFor_idx" ON "FollowUp"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "FollowUp_prospectId_idx" ON "FollowUp"("prospectId");

-- CreateIndex
CREATE INDEX "AgentEvent_createdAt_idx" ON "AgentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_prospectId_idx" ON "AgentEvent"("prospectId");

-- CreateIndex
CREATE INDEX "AgentEvent_type_idx" ON "AgentEvent"("type");

-- CreateIndex
CREATE INDEX "AgentRun_agent_createdAt_idx" ON "AgentRun"("agent", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_prospectId_idx" ON "AgentRun"("prospectId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
