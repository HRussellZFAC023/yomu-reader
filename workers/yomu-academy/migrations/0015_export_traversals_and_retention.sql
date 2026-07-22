-- Account-scoped export traversals and explicit deletion-receipt retention.
-- Continuation secrets are HMACed before storage. A traversal freezes the
-- highest event sequence visible at start and advances each independent
-- Academy/Reader cursor once. page_number is the one-use continuation guard.

PRAGMA foreign_keys = ON;

CREATE TABLE export_traversals (
    id_hash TEXT PRIMARY KEY CHECK (length(id_hash) = 64),
    session_public_id TEXT NOT NULL REFERENCES sessions(public_id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('profile', 'account')),
    academy_snapshot_sequence INTEGER NOT NULL CHECK (academy_snapshot_sequence >= 0),
    academy_page_start_cursor INTEGER NOT NULL DEFAULT 0 CHECK (academy_page_start_cursor >= 0),
    academy_next_cursor INTEGER NOT NULL DEFAULT 0 CHECK (academy_next_cursor >= 0),
    reader_snapshot_sequence INTEGER NOT NULL CHECK (reader_snapshot_sequence >= 0),
    reader_page_start_cursor INTEGER NOT NULL DEFAULT 0 CHECK (reader_page_start_cursor >= 0),
    reader_next_cursor INTEGER NOT NULL DEFAULT 0 CHECK (reader_next_cursor >= 0),
    page_size INTEGER NOT NULL CHECK (page_size = 200),
    page_number INTEGER NOT NULL DEFAULT 0 CHECK (page_number >= 0),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    completed_at INTEGER,
    CHECK (expires_at > created_at),
    CHECK (academy_page_start_cursor <= academy_next_cursor),
    CHECK (academy_next_cursor <= academy_snapshot_sequence),
    CHECK (reader_page_start_cursor <= reader_next_cursor),
    CHECK (reader_next_cursor <= reader_snapshot_sequence)
);
CREATE INDEX idx_export_traversals_expiry ON export_traversals(expires_at, completed_at);

ALTER TABLE deletion_receipts ADD COLUMN prune_after INTEGER;
UPDATE deletion_receipts SET prune_after = deleted_at + 7776000000 WHERE prune_after IS NULL;
CREATE INDEX idx_deletion_receipts_prune_after ON deletion_receipts(prune_after);
