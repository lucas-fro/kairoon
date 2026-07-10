ALTER TABLE "loyalty_programs" DROP CONSTRAINT "loyalty_programs_reward_service_id_services_id_fk";
--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" DROP CONSTRAINT "loyalty_redemptions_reward_service_id_services_id_fk";
--> statement-breakpoint
ALTER TABLE "points_rewards" DROP CONSTRAINT "points_rewards_reward_service_id_services_id_fk";
--> statement-breakpoint
ALTER TABLE "loyalty_programs" DROP COLUMN "reward_service_id";--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" DROP COLUMN "reward_service_id";--> statement-breakpoint
ALTER TABLE "points_rewards" DROP COLUMN "reward_service_id";