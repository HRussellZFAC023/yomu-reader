-- Invite-owned access policy. All existing and future invites require an
-- account unless an administrator explicitly creates the sole exception.

PRAGMA foreign_keys = ON;

ALTER TABLE invites ADD COLUMN account_required INTEGER NOT NULL DEFAULT 1
    CHECK (account_required IN (0, 1) AND (account_required = 1 OR kind = 'seed'));

CREATE UNIQUE INDEX idx_invites_single_anonymous
    ON invites(account_required)
    WHERE account_required = 0;
