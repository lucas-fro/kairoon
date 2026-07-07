ALTER TABLE "appointments" ADD COLUMN "debt_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "tip_cents" integer DEFAULT 0 NOT NULL;