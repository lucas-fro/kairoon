ALTER TABLE "subscriptions" ALTER COLUMN "asaas_subscription_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "asaas_installment_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "installments" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_asaas_installment_idx" ON "subscriptions" USING btree ("asaas_installment_id");