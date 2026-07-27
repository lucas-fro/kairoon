ALTER TABLE "appointments" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "whatsapp_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "notify_whatsapp" boolean DEFAULT true NOT NULL;