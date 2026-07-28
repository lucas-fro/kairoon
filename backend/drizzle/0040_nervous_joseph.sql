ALTER TABLE "subscriptions" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "promo_restored_at" timestamp with time zone;