-- Authoritative, privacy-minimized projection of paid-code delivery.
-- The redeem code and payment email never enter D1. A Service-binding caller
-- receives the deterministic code only while it owns a short delivery lease.

PRAGMA foreign_keys = ON;

CREATE TABLE payment_code_deliveries (
    purchase_id TEXT PRIMARY KEY REFERENCES purchases(id) ON DELETE CASCADE,
    id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'kofi', 'patreon')),
    status TEXT NOT NULL
        CHECK (status IN ('pending', 'leased', 'email_accepted', 'manual_required', 'retry')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    available_at INTEGER NOT NULL,
    lease_token_hash TEXT CHECK (lease_token_hash IS NULL OR length(lease_token_hash) = 64),
    lease_expires_at INTEGER,
    last_attempt_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (
        (status = 'leased' AND lease_token_hash IS NOT NULL AND lease_expires_at IS NOT NULL AND completed_at IS NULL)
        OR (status IN ('pending', 'retry') AND lease_token_hash IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
        OR (status IN ('email_accepted', 'manual_required') AND lease_token_hash IS NOT NULL AND lease_expires_at IS NULL AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_payment_code_deliveries_actionable
ON payment_code_deliveries(status, available_at, updated_at);

-- Only canonical provider entitlements are eligible. Historical rows start
-- pending because the released schema cannot prove that a donor received the
-- code. The detector can surface them without retaining provider identifiers.
INSERT INTO payment_code_deliveries (
    purchase_id, id, provider, status, attempt_count, available_at,
    created_at, updated_at
)
SELECT
    p.id,
    'paydel_' || lower(hex(randomblob(20))),
    pe.provider,
    'pending',
    0,
    COALESCE(p.fulfilled_at, pe.effective_at),
    COALESCE(p.fulfilled_at, pe.effective_at),
    COALESCE(p.fulfilled_at, pe.updated_at)
FROM payment_entitlements pe
JOIN purchases p ON p.id = pe.purchase_id
JOIN invites i ON i.id = p.invite_id
WHERE pe.state = 'active'
  AND p.status = 'paid'
  AND p.redeemed_at IS NULL
  AND i.kind = 'paid'
  AND i.revoked_at IS NULL
  AND i.uses_remaining > 0
  AND (i.expires_at IS NULL OR i.expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000)
  AND (pe.expires_at IS NULL OR pe.expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000);
