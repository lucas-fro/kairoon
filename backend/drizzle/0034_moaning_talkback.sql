ALTER TABLE "employees" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: todo estabelecimento passa a ter exatamente um profissional dono.
-- 1) Nos estabelecimentos que já têm profissionais, o dono é o mais antigo
--    (no cadastro o dono é o primeiro profissional inserido).
UPDATE "employees" AS e
SET "is_owner" = true
WHERE e."id" = (
  SELECT e2."id"
  FROM "employees" AS e2
  WHERE e2."establishment_id" = e."establishment_id"
  ORDER BY e2."created_at" ASC, e2."id" ASC
  LIMIT 1
);--> statement-breakpoint
-- 2) Estabelecimentos legados sem nenhum profissional ganham o dono a partir da
--    conta (nome do usuário dono), para manter a invariante de no mínimo um.
INSERT INTO "employees" ("establishment_id", "name", "is_owner")
SELECT est."id", u."name", true
FROM "establishments" AS est
JOIN "users" AS u ON u."id" = est."owner_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "employees" AS emp WHERE emp."establishment_id" = est."id"
);
