-- Exactly-once support accounting for verified Ko-fi and Patreon events.
-- The composite key makes concurrent webhook retries converge on one row;
-- totals are derived from immutable events instead of KV read-modify-write.

CREATE TABLE IF NOT EXISTS provider_donation_events (
  provider TEXT NOT NULL CHECK (provider IN ('kofi', 'patreon')),
  event_id TEXT NOT NULL,
  day TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'gbp'),
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS provider_donation_events_day_currency_idx
  ON provider_donation_events (day, currency);
