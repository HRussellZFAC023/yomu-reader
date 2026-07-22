-- Supervisor-minted, single-use authorization for destructive production
-- lifecycle proofs. Only HMAC digests of the bearer token and run nonce are
-- stored. The account link is cleared when the marked account is deleted.

PRAGMA foreign_keys = ON;

CREATE TABLE account_lifecycle_proof_grants (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    run_nonce_hash TEXT NOT NULL CHECK (length(run_nonce_hash) = 64),
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    environment TEXT NOT NULL CHECK (environment = 'production'),
    scope TEXT NOT NULL CHECK (scope = 'account-lifecycle-production-test'),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    consume_nonce TEXT UNIQUE,
    CHECK (expires_at > created_at),
    CHECK (
        (consumed_at IS NULL AND consume_nonce IS NULL)
        OR (consumed_at IS NOT NULL AND consume_nonce IS NOT NULL)
    )
);

CREATE INDEX idx_account_lifecycle_proof_grants_account
ON account_lifecycle_proof_grants(account_id, expires_at, consumed_at);

CREATE INDEX idx_account_lifecycle_proof_grants_expiry
ON account_lifecycle_proof_grants(expires_at);
