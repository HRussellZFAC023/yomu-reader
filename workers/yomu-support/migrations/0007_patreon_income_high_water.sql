-- Patreon Member webhooks expose a cumulative campaign-lifetime total rather
-- than a charge transaction. Keep a per-member high-water mark so unrelated
-- membership updates cannot count the same paid income twice.

CREATE TABLE patreon_member_accounting (
  campaign_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  currency TEXT NOT NULL
    CHECK (length(currency) = 3 AND currency = lower(currency)),
  lifetime_support_minor INTEGER NOT NULL
    CHECK (lifetime_support_minor >= 0),
  last_charge_at INTEGER NOT NULL CHECK (last_charge_at >= 0),
  event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, member_id, currency)
);

-- The high-water update and its ledger delta share one SQLite transaction.
-- Concurrent or out-of-order snapshots therefore converge on the cumulative
-- paid total without read/modify/write races.
CREATE TRIGGER patreon_member_accounting_paid_delta
AFTER UPDATE OF lifetime_support_minor ON patreon_member_accounting
WHEN NEW.lifetime_support_minor > OLD.lifetime_support_minor
  AND NEW.last_charge_at >= OLD.last_charge_at
BEGIN
  INSERT OR IGNORE INTO provider_donation_events (
    provider,
    event_id,
    day,
    amount_minor,
    currency,
    base_currency,
    base_amount_minor,
    needs_rate,
    event_type,
    occurred_at,
    received_at
  ) VALUES (
    'patreon',
    NEW.event_id,
    strftime('%Y-%m-%d', NEW.last_charge_at / 1000, 'unixepoch'),
    NEW.lifetime_support_minor - OLD.lifetime_support_minor,
    NEW.currency,
    'gbp',
    CASE
      WHEN NEW.currency = 'gbp'
        THEN NEW.lifetime_support_minor - OLD.lifetime_support_minor
      ELSE 0
    END,
    CASE WHEN NEW.currency = 'gbp' THEN 0 ELSE 1 END,
    'members:update',
    NEW.last_charge_at,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;
