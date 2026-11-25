ALTER TABLE "Prospect"
  ADD COLUMN "whatsappFollowUpConsent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Prospect"
  RENAME COLUMN "emailOptOutToken" TO "followUpOptOutToken";

ALTER INDEX "Prospect_emailOptOutToken_key"
  RENAME TO "Prospect_followUpOptOutToken_key";
