ALTER TABLE "establishments" ALTER COLUMN "payment_settings" SET DEFAULT '{"cash":true,"pix":true,"debit":true,"credit":{"enabled":true,"maxInstallments":12,"receiptMode":"upfront"}}'::jsonb;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_number" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_total" integer;