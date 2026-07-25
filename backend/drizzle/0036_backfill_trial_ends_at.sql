-- A 0030 adicionou trial_ends_at como nullable e não preencheu as linhas que já
-- existiam. Toda conta criada antes dela ficou com NULL, e o motor de acesso
-- tratava NULL como "conta legada": plano free GRAVÁVEL para sempre, ou seja,
-- um plano gratuito vitalício que o produto não vende.
--
-- Dá a essas contas o mesmo teste de 14 dias de qualquer outra, contado do
-- cadastro. Como todas foram criadas há mais de 14 dias, na prática elas caem em
-- somente-leitura até assinar, igual a um teste normal que venceu.
UPDATE "establishments"
SET "trial_ends_at" = "created_at" + interval '14 days'
WHERE "trial_ends_at" IS NULL;
