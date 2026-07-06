CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'scheduled');--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"preferred_employee_id" uuid,
	"target_date" date NOT NULL,
	"note" text,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"scheduled_appointment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "banner_image_url" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "footer_message" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_preferred_employee_id_employees_id_fk" FOREIGN KEY ("preferred_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_scheduled_appointment_id_appointments_id_fk" FOREIGN KEY ("scheduled_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_entries_establishment_status_date_idx" ON "waitlist_entries" USING btree ("establishment_id","status","target_date");