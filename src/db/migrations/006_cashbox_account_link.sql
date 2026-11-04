-- Migration 006: Add account_id to cashboxes for treasury-audit linking
-- This is a non-destructive migration: it adds a nullable column and links
-- existing cashboxes to acc_cash (code 101) as a safe default.

ALTER TABLE cashboxes ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;

-- Link any existing cashbox that has no account_id to acc_cash (the main cash account, code 101)
UPDATE cashboxes
SET account_id = 'acc_cash', updated_at = now()
WHERE account_id IS NULL;

INSERT INTO schema_migrations (id) VALUES ('006_cashbox_account_link') ON CONFLICT (id) DO NOTHING;
