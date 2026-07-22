-- Privacy-minimized deletion receipts. A receipt proves that the requested
-- profile/account cascade completed without retaining account, profile,
-- provider, session, invite, or device identifiers.

PRAGMA foreign_keys = ON;

CREATE TABLE deletion_receipts (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('profile', 'account')),
    deleted_at INTEGER NOT NULL,
    profile_count INTEGER NOT NULL CHECK (profile_count >= 0),
    device_count INTEGER NOT NULL CHECK (device_count >= 0),
    synced_record_count INTEGER NOT NULL CHECK (synced_record_count >= 0)
);
CREATE INDEX idx_deletion_receipts_deleted_at ON deletion_receipts(deleted_at);
