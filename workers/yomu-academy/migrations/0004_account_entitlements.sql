-- Durable paid entitlements. A fulfilled purchase remains pending redemption
-- until a verified Google account claims it. `redeemed_at` is deliberately
-- retained after account deletion so a paid code can never become transferable.

PRAGMA foreign_keys = ON;

ALTER TABLE purchases ADD COLUMN redeemed_by_account_id TEXT
    REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE purchases ADD COLUMN redeemed_at INTEGER;

-- One paid purchase per account. A purchase row itself can hold only one
-- account, which gives the inverse one-account-per-code guarantee.
CREATE UNIQUE INDEX idx_purchases_redeemed_account
    ON purchases(redeemed_by_account_id)
    WHERE redeemed_by_account_id IS NOT NULL;
CREATE INDEX idx_purchases_redeemed_at ON purchases(redeemed_at);
