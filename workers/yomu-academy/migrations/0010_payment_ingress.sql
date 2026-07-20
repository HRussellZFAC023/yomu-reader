-- Canonical multi-provider payment ledger and Academy entitlement projection.
-- Provider identifiers are HMACed in the Worker before they reach D1. Events,
-- actual charges, stable provider subjects, and authorization state remain
-- separate so membership notifications cannot be mistaken for cash receipts.

PRAGMA foreign_keys = ON;

CREATE TABLE payment_subjects (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'kofi', 'patreon')),
    provider_subject_hash TEXT NOT NULL,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('academy_purchase', 'payer', 'member', 'transaction')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (provider, provider_subject_hash)
);

CREATE TABLE payment_transactions (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'kofi')),
    provider_transaction_hash TEXT NOT NULL,
    provider_session_hash TEXT,
    subject_id TEXT NOT NULL REFERENCES payment_subjects(id),
    currency TEXT NOT NULL CHECK (length(currency) = 3),
    amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 50000),
    status TEXT NOT NULL CHECK (status IN ('settled', 'refunded')),
    occurred_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    UNIQUE (provider, provider_transaction_hash),
    UNIQUE (provider, provider_session_hash)
);
CREATE INDEX idx_payment_transactions_subject ON payment_transactions(subject_id, occurred_at);

CREATE TABLE payment_entitlements (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'kofi', 'patreon')),
    subject_id TEXT NOT NULL UNIQUE REFERENCES payment_subjects(id),
    purchase_id TEXT UNIQUE REFERENCES purchases(id),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    effective_at INTEGER NOT NULL,
    expires_at INTEGER,
    updated_at INTEGER NOT NULL,
    CHECK (expires_at IS NULL OR expires_at > effective_at)
);
CREATE INDEX idx_payment_entitlements_access ON payment_entitlements(state, expires_at);

CREATE TABLE payment_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'kofi', 'patreon')),
    provider_event_hash TEXT NOT NULL,
    event_type TEXT NOT NULL,
    subject_id TEXT REFERENCES payment_subjects(id),
    transaction_id TEXT REFERENCES payment_transactions(id),
    occurred_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    disposition TEXT NOT NULL CHECK (disposition IN ('accepted', 'irrelevant')),
    UNIQUE (provider, provider_event_hash)
);
CREATE INDEX idx_payment_events_received ON payment_events(received_at);
