ALTER TABLE "users" ADD COLUMN "password_reset_code_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_expires_at" timestamp with time zone;