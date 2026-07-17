-- A bare account row may exist briefly before entitlement/profile attachment.
-- Recovery trusts only a completed durable binding, while retaining account
-- identity after the learner deliberately deletes encrypted profile data.

PRAGMA foreign_keys = ON;

ALTER TABLE accounts ADD COLUMN recovery_bound_at INTEGER;

UPDATE accounts SET recovery_bound_at = updated_at
WHERE EXISTS (SELECT 1 FROM profiles WHERE profiles.account_id = accounts.id)
    OR EXISTS (
        SELECT 1 FROM purchases
        WHERE purchases.redeemed_by_account_id = accounts.id
            AND purchases.status = 'paid'
            AND purchases.redeemed_at IS NOT NULL
    )
    OR EXISTS (SELECT 1 FROM sessions WHERE sessions.account_id = accounts.id)
    OR EXISTS (SELECT 1 FROM class_memberships WHERE class_memberships.account_id = accounts.id);
