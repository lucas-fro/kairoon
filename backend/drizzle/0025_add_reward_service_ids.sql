ALTER TABLE "loyalty_programs" ADD COLUMN "reward_service_ids" jsonb;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD COLUMN "reward_service_ids" jsonb;--> statement-breakpoint
ALTER TABLE "points_rewards" ADD COLUMN "reward_service_ids" jsonb;