-- Academy access schema: invites, sessions, rate limits, donation purchases,
-- and webhook idempotency. No plaintext invite codes, session tokens, claim
-- tokens, or raw IPs are ever stored — only HMAC digests.

PRAGMA foreign_keys = ON;

CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    uses_remaining INTEGER NOT NULL CHECK (uses_remaining >= 0 AND uses_remaining <= 100000),
    kind TEXT NOT NULL CHECK (kind IN ('seed', 'paid')),
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    revoked_at INTEGER,
    purchase_id TEXT UNIQUE,
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    invite_id TEXT NOT NULL REFERENCES invites(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    offline_resume_until INTEGER NOT NULL,
    revoked_at INTEGER,
    CHECK (expires_at > created_at),
    CHECK (offline_resume_until >= expires_at)
);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Fixed-window counters keyed by HMACed client subject.
CREATE TABLE rate_limits (
    subject TEXT NOT NULL,
    bucket TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 1),
    PRIMARY KEY (subject, bucket, window_start)
);
CREATE INDEX idx_rate_limits_window_start ON rate_limits(window_start);

CREATE TABLE purchases (
    id TEXT PRIMARY KEY,
    claim_hash TEXT NOT NULL UNIQUE,
    checkout_session_id TEXT UNIQUE,
    amount_pence INTEGER NOT NULL CHECK (amount_pence BETWEEN 200 AND 50000),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
    created_at INTEGER NOT NULL,
    fulfilled_at INTEGER,
    invite_id TEXT UNIQUE REFERENCES invites(id)
);
CREATE INDEX idx_purchases_status_created_at ON purchases(status, created_at);

-- One row per delivered Stripe event id: INSERT OR IGNORE gates fulfilment.
CREATE TABLE webhook_events (
    event_id TEXT PRIMARY KEY,
    received_at INTEGER NOT NULL
);
