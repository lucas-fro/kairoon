ALTER TABLE "services" ADD COLUMN "is_package" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "package_service_ids" jsonb;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "package_discount_type" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "package_discount_value" integer;