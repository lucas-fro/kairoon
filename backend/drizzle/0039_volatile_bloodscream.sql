CREATE TABLE "staff_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "establishments" DROP CONSTRAINT "establishments_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bookable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
--> O dono deixa de ser coluna do estabelecimento e passa a ser a ficha com
--> is_owner: leva o vínculo de login para lá antes de derrubar owner_id, senão
--> ninguém mais entra num banco que já tinha contas.
UPDATE "employees" e SET "user_id" = est."owner_id" FROM "establishments" est WHERE est."id" = e."establishment_id" AND e."is_owner";--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_invites_token_idx" ON "staff_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invites_open_employee_idx" ON "staff_invites" USING btree ("employee_id") WHERE "staff_invites"."accepted_at" is null and "staff_invites"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_idx" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_owner_idx" ON "employees" USING btree ("establishment_id") WHERE "employees"."is_owner";--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN "owner_id";