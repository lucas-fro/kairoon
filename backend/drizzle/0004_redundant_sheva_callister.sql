ALTER TYPE "public"."appointment_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "auto_confirm" boolean DEFAULT true NOT NULL;