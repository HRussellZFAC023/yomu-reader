-- Every invite now requires an authenticated account; the single
-- administrator-designated anonymous exception is withdrawn. Existing
-- account-free invites (the reusable class invite) are upgraded in place:
-- their sessions keep working but gate on Google sign-in from now on.

PRAGMA foreign_keys = ON;

UPDATE invites SET account_required = 1 WHERE account_required = 0;

DROP INDEX IF EXISTS idx_invites_single_anonymous;
