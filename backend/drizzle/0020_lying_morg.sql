ALTER TABLE "establishments" ALTER COLUMN "payment_settings" SET DEFAULT '{"cash":true,"pix":true,"debit":true,"credit":{"enabled":true,"maxInstallments":12}}'::jsonb;
--> statement-breakpoint
UPDATE "establishments"
SET payment_settings = jsonb_set(
	payment_settings,
	'{credit}',
	jsonb_build_object(
		'enabled', COALESCE((payment_settings -> 'credit' ->> 'enabled')::boolean, true),
		'maxInstallments', COALESCE(
			(SELECT MAX((b ->> 'maxInstallments')::int) FROM jsonb_array_elements(payment_settings -> 'credit' -> 'brands') b),
			12
		)
	)
)
WHERE payment_settings -> 'credit' ? 'brands';