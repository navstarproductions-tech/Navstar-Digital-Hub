ALTER TABLE customer_accounts ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_accounts_google_sub
ON customer_accounts(google_sub) WHERE google_sub IS NOT NULL;
