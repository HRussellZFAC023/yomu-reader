-- Learner profiles, secure device pairing, and local-first event sync. Route
-- authorization limits anonymous use to UCL2026. Event bodies and profile
-- keys are encrypted by the client; D1 stores
-- only ciphertext, opaque ids, timestamps, and one-time-code HMACs. Provider
-- credentials have no plaintext column in this schema.

PRAGMA foreign_keys = ON;

CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    account_id TEXT UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    sync_key_version INTEGER NOT NULL DEFAULT 1 CHECK (sync_key_version BETWEEN 1 AND 1000000),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE profile_devices (
    id TEXT PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER
);
CREATE INDEX idx_profile_devices_profile ON profile_devices(profile_id, revoked_at);

-- Existing sessions remain valid and acquire these links lazily on their
-- first profile/account/sync request.
ALTER TABLE sessions ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN device_id TEXT REFERENCES profile_devices(id) ON DELETE SET NULL;
CREATE INDEX idx_sessions_profile_id ON sessions(profile_id);
CREATE INDEX idx_sessions_device_id ON sessions(device_id);

CREATE TABLE device_pairings (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_by_device_id TEXT NOT NULL REFERENCES profile_devices(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    key_version INTEGER,
    key_salt TEXT,
    key_nonce TEXT,
    wrapped_key TEXT,
    consumed_at INTEGER,
    consumed_by_device_id TEXT REFERENCES profile_devices(id) ON DELETE SET NULL,
    CHECK (expires_at > created_at),
    CHECK (
        (key_version IS NULL AND key_salt IS NULL AND key_nonce IS NULL AND wrapped_key IS NULL)
        OR
        (key_version BETWEEN 1 AND 1000000 AND key_salt IS NOT NULL AND key_nonce IS NOT NULL AND wrapped_key IS NOT NULL)
    )
);
CREATE INDEX idx_device_pairings_expiry ON device_pairings(expires_at, consumed_at);

CREATE TABLE srs_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL CHECK (length(event_id) = 36),
    source_device_id TEXT REFERENCES profile_devices(id) ON DELETE SET NULL,
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
    key_version INTEGER NOT NULL CHECK (key_version BETWEEN 1 AND 1000000),
    nonce TEXT NOT NULL CHECK (length(nonce) = 16),
    ciphertext TEXT NOT NULL CHECK (length(ciphertext) BETWEEN 23 AND 24000),
    event_hash TEXT NOT NULL CHECK (length(event_hash) = 64),
    received_at INTEGER NOT NULL,
    UNIQUE (profile_id, event_id)
);
CREATE INDEX idx_srs_events_profile_sequence ON srs_events(profile_id, sequence);
