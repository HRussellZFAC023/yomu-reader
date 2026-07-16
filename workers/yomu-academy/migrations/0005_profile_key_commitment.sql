-- Pin each profile to one client-generated encryption key without storing the
-- key itself. The SHA-256 commitment makes first-device initialization atomic
-- even when two empty account devices connect concurrently.

PRAGMA foreign_keys = ON;

ALTER TABLE profiles ADD COLUMN sync_key_commitment TEXT
    CHECK (
        sync_key_commitment IS NULL
        OR (
            length(sync_key_commitment) = 43
            AND sync_key_commitment NOT GLOB '*[^A-Za-z0-9_-]*'
        )
    );
