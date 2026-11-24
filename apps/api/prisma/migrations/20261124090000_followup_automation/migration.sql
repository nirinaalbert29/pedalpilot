ALTER TYPE "FollowUpStatus" ADD VALUE 'PROCESSING' BEFORE 'SENT';

ALTER TABLE "Prospect"
  ADD COLUMN "emailFollowUpConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailOptOutToken" TEXT;

CREATE UNIQUE INDEX "Prospect_emailOptOutToken_key" ON "Prospect"("emailOptOutToken");

ALTER TABLE "FollowUp" ADD COLUMN "processingAt" TIMESTAMP(3);
