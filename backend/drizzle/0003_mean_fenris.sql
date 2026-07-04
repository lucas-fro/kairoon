ALTER TABLE "establishments" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "socials" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cpf" text;