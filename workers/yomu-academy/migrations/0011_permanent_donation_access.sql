-- Every verified positive donation may create a permanent Academy entitlement.
-- Relax the original GBP 2..500 bounds without rewriting the released schemas;
-- provider adapters and the private ingress still require positive safe integers.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE purchases_next (
    id TEXT PRIMARY KEY,
    claim_hash TEXT NOT NULL UNIQUE,
    checkout_session_id TEXT UNIQUE,
    amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
    created_at INTEGER NOT NULL,
    fulfilled_at INTEGER,
    invite_id TEXT UNIQUE REFERENCES invites(id),
    redeemed_by_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    redeemed_at INTEGER
);

INSERT INTO purchases_next (
    id, claim_hash, checkout_session_id, amount_pence, status, created_at,
    fulfilled_at, invite_id, redeemed_by_account_id, redeemed_at
)
SELECT id, claim_hash, checkout_session_id, amount_pence, status, created_at,
    fulfilled_at, invite_id, redeemed_by_account_id, redeemed_at
FROM purchases;

DROP TABLE purchases;
ALTER TABLE purchases_next RENAME TO purchases;
CREATE INDEX idx_purchases_status_created_at ON purchases(status, created_at);
CREATE UNIQUE INDEX idx_purchases_redeemed_account
    ON purchases(redeemed_by_account_id)
    WHERE redeemed_by_account_id IS NOT NULL;
CREATE INDEX idx_purchases_redeemed_at ON purchases(redeemed_at);

CREATE TABLE payment_transactions_next (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'kofi')),
    provider_transaction_hash TEXT NOT NULL,
    provider_session_hash TEXT,
    subject_id TEXT NOT NULL REFERENCES payment_subjects(id),
    currency TEXT NOT NULL CHECK (length(currency) = 3),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    status TEXT NOT NULL CHECK (status IN ('settled', 'refunded')),
    occurred_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    UNIQUE (provider, provider_transaction_hash),
    UNIQUE (provider, provider_session_hash)
);

INSERT INTO payment_transactions_next (
    id, provider, provider_transaction_hash, provider_session_hash, subject_id,
    currency, amount_minor, status, occurred_at, received_at
)
SELECT id, provider, provider_transaction_hash, provider_session_hash, subject_id,
    currency, amount_minor, status, occurred_at, received_at
FROM payment_transactions;

DROP TABLE payment_transactions;
ALTER TABLE payment_transactions_next RENAME TO payment_transactions;
CREATE INDEX idx_payment_transactions_subject
    ON payment_transactions(subject_id, occurred_at);

