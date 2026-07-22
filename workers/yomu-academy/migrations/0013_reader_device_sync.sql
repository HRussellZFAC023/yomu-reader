CREATE TABLE profile_device_credentials (
    id TEXT PRIMARY KEY,
    profile_device_id TEXT NOT NULL UNIQUE REFERENCES profile_devices(id) ON DELETE CASCADE,
    claim_request_id TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER
);

CREATE INDEX idx_profile_device_credentials_active
    ON profile_device_credentials(token_hash, revoked_at);

CREATE TABLE reader_srs_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    source_device_id TEXT NOT NULL REFERENCES profile_devices(id) ON DELETE CASCADE,
    occurred_at INTEGER NOT NULL,
    key_version INTEGER NOT NULL CHECK(key_version >= 1),
    nonce TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    event_hash TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    UNIQUE(profile_id, event_id)
);

CREATE INDEX idx_reader_srs_events_profile_sequence
    ON reader_srs_events(profile_id, sequence);
