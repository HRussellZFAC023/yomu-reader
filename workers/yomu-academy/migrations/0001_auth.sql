PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS academy_invites (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('class', 'paid')),
  label TEXT,
  max_uses INTEGER NOT NULL CHECK (max_uses >= 1 AND max_uses <= 100000),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0 AND use_count <= max_uses),
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_by TEXT NOT NULL CHECK (created_by IN ('admin', 'stripe')),
  stripe_checkout_session_id TEXT UNIQUE,
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Login performs an active-code lookup before atomically consuming one use.
CREATE INDEX IF NOT EXISTS academy_invites_active_code_lookup_idx
  ON academy_invites (code_hash, expires_at, use_count, max_uses)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS academy_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  invite_id TEXT NOT NULL REFERENCES academy_invites(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at)
);

-- Every protected Academy request resolves a session by token hash.
CREATE INDEX IF NOT EXISTS academy_sessions_active_token_lookup_idx
  ON academy_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS academy_sessions_invite_idx
  ON academy_sessions (invite_id, expires_at);

-- Public mutation throttles use HMACed client subjects and fixed windows.
CREATE TABLE IF NOT EXISTS academy_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  PRIMARY KEY (scope, subject_hash, window_start)
);

CREATE INDEX IF NOT EXISTS academy_rate_limits_window_cleanup_idx
  ON academy_rate_limits (window_start);

CREATE TABLE IF NOT EXISTS academy_stripe_checkouts (
  purchase_id TEXT PRIMARY KEY,
  claim_token_hash TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  stripe_session_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('created', 'open', 'failed', 'paid')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER,
  paid_stripe_event_id TEXT,
  paid_invite_id TEXT REFERENCES academy_invites(id),
  CHECK (expires_at > created_at)
);

-- Checkout verification is keyed by Stripe's immutable Checkout Session id.
CREATE UNIQUE INDEX IF NOT EXISTS academy_stripe_checkouts_session_idempotency_idx
  ON academy_stripe_checkouts (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS academy_stripe_checkouts_claim_lookup_idx
  ON academy_stripe_checkouts (claim_token_hash, expires_at);

CREATE TABLE IF NOT EXISTS academy_stripe_events (
  id INTEGER PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  stripe_session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stripe_created_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

-- Stripe retries use the immutable event id; this lookup supports audit and recovery by session.
CREATE INDEX IF NOT EXISTS academy_stripe_events_session_idx
  ON academy_stripe_events (stripe_session_id, received_at);
