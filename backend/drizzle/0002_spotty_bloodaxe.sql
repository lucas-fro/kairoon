CREATE TABLE "time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "work_start" text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "work_end" text DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "lunch_start" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "lunch_end" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "work_days" jsonb DEFAULT '[1,2,3,4,5,6]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_blocks_establishment_date_idx" ON "time_blocks" USING btree ("establishment_id","date");