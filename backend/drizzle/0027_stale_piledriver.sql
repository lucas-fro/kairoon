ALTER TABLE "subscriptions" ADD COLUMN "credit_card_token" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "card_last4" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "card_brand" text;