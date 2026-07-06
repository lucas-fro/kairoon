ALTER TABLE "employees" ADD COLUMN "salary_cents" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bonuses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "vr_cents" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "vt_cents" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "va_cents" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "payment_days" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "supplier" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_employee_idx" ON "transactions" USING btree ("employee_id");--> statement-breakpoint
ALTER TABLE "recurring_expenses" DROP COLUMN "category";