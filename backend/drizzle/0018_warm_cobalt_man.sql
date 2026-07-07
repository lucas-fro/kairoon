CREATE TYPE "public"."coupon_applies_to" AS ENUM('total', 'service');--> statement-breakpoint
CREATE TYPE "public"."coupon_discount_type" AS ENUM('percent', 'fixed', 'free_service');--> statement-breakpoint
CREATE TYPE "public"."coupon_source" AS ENUM('manual', 'campaign', 'loyalty', 'points');--> statement-breakpoint
CREATE TYPE "public"."loyalty_reward_type" AS ENUM('free_service', 'percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."points_entry_type" AS ENUM('earn', 'redeem');--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"coupon_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"discount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text,
	"code" text,
	"source" "coupon_source" DEFAULT 'manual' NOT NULL,
	"discount_type" "coupon_discount_type" NOT NULL,
	"discount_value" integer DEFAULT 0 NOT NULL,
	"applies_to" "coupon_applies_to" DEFAULT 'total' NOT NULL,
	"applies_to_service_ids" jsonb,
	"min_spend_cents" integer DEFAULT 0 NOT NULL,
	"max_discount_cents" integer,
	"valid_from" date,
	"valid_until" date,
	"max_uses" integer,
	"uses_per_client" integer DEFAULT 1 NOT NULL,
	"first_visit_only" boolean DEFAULT false NOT NULL,
	"auto_apply" boolean DEFAULT false NOT NULL,
	"client_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"stamps_required" integer DEFAULT 10 NOT NULL,
	"min_ticket_cents" integer DEFAULT 0 NOT NULL,
	"reward_type" "loyalty_reward_type" DEFAULT 'free_service' NOT NULL,
	"reward_value" integer DEFAULT 0 NOT NULL,
	"reward_service_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"stamps_spent" integer NOT NULL,
	"coupon_id" uuid,
	"reward_type" "loyalty_reward_type" NOT NULL,
	"reward_value" integer NOT NULL,
	"reward_service_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_stamps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"redemption_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid,
	"reward_id" uuid,
	"type" "points_entry_type" NOT NULL,
	"points" integer NOT NULL,
	"coupon_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"points_per_service" integer DEFAULT 0 NOT NULL,
	"points_per_currency_unit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cost_points" integer NOT NULL,
	"reward_type" "coupon_discount_type" NOT NULL,
	"reward_value" integer DEFAULT 0 NOT NULL,
	"reward_service_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_reward_service_id_services_id_fk" FOREIGN KEY ("reward_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_reward_service_id_services_id_fk" FOREIGN KEY ("reward_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_stamps" ADD CONSTRAINT "loyalty_stamps_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_stamps" ADD CONSTRAINT "loyalty_stamps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_stamps" ADD CONSTRAINT "loyalty_stamps_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_stamps" ADD CONSTRAINT "loyalty_stamps_redemption_id_loyalty_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."loyalty_redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_reward_id_points_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."points_rewards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_programs" ADD CONSTRAINT "points_programs_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_rewards" ADD CONSTRAINT "points_rewards_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_rewards" ADD CONSTRAINT "points_rewards_reward_service_id_services_id_fk" FOREIGN KEY ("reward_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_appointment_idx" ON "coupon_redemptions" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_idx" ON "coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_client_idx" ON "coupon_redemptions" USING btree ("coupon_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_establishment_code_idx" ON "coupons" USING btree ("establishment_id","code");--> statement-breakpoint
CREATE INDEX "coupons_establishment_client_idx" ON "coupons" USING btree ("establishment_id","client_id");--> statement-breakpoint
CREATE INDEX "coupons_establishment_active_auto_idx" ON "coupons" USING btree ("establishment_id","active","auto_apply");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_programs_establishment_idx" ON "loyalty_programs" USING btree ("establishment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_stamps_appointment_idx" ON "loyalty_stamps" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "loyalty_stamps_establishment_client_idx" ON "loyalty_stamps" USING btree ("establishment_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "points_entries_appointment_idx" ON "points_entries" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "points_entries_establishment_client_idx" ON "points_entries" USING btree ("establishment_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "points_programs_establishment_idx" ON "points_programs" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "points_rewards_establishment_active_idx" ON "points_rewards" USING btree ("establishment_id","active");