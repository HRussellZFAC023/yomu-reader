ALTER TABLE accounts
    ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'academy'
    CHECK(access_tier IN ('reader', 'academy'));

-- Seed invitations are permanent Academy grants. Paid access is deliberately
-- resolved from the live entitlement so refunds, revocations, and expiries
-- continue to take effect after a later Reader/recovery sign-in.
CREATE TABLE account_academy_grants (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    source_invite_id TEXT REFERENCES invites(id),
    granted_at INTEGER NOT NULL,
    grant_reason TEXT NOT NULL DEFAULT 'seed-invite'
        CHECK(grant_reason IN ('seed-invite', 'legacy-academy-account')),
    CHECK(
        (grant_reason = 'seed-invite' AND source_invite_id IS NOT NULL)
        OR (grant_reason = 'legacy-academy-account' AND source_invite_id IS NULL)
    )
);

INSERT OR IGNORE INTO account_academy_grants (account_id, source_invite_id, granted_at)
SELECT s.account_id, MIN(s.invite_id), MIN(s.created_at)
FROM sessions s
JOIN invites i ON i.id = s.invite_id
WHERE s.account_id IS NOT NULL
  AND i.kind = 'seed'
  AND s.invite_id NOT IN ('system_google_recovery_v1', 'system_reader_account_v1')
GROUP BY s.account_id;

-- Reader accounts did not exist before this migration. Preserve every
-- recoverable pre-migration Academy account that is not backed by a paid
-- purchase, including owners who deliberately deleted their profile (and
-- therefore all sessions) while retaining their recovery-bound identity.
INSERT OR IGNORE INTO account_academy_grants (
    account_id, source_invite_id, granted_at, grant_reason
)
SELECT a.id, NULL, a.created_at, 'legacy-academy-account'
FROM accounts a
WHERE a.recovery_bound_at IS NOT NULL
  AND (
      NOT EXISTS (SELECT 1 FROM purchases p WHERE p.redeemed_by_account_id = a.id)
      -- Paid-only account creation and redemption used the same Worker clock.
      -- An older account redeemed later only if it already existed through a
      -- permanent seed/class grant whose now-deleted session is no longer
      -- available to the first backfill above.
      OR EXISTS (
          SELECT 1 FROM purchases p
          WHERE p.redeemed_by_account_id = a.id
            AND p.redeemed_at IS NOT NULL
            AND a.created_at < p.redeemed_at
      )
  );
