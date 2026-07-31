-- Extend the immutable provider ledger to every provider shown by the support
-- service. Existing Ko-fi and Patreon rows keep their primary keys unchanged.

CREATE TABLE provider_donation_events_v3 (
  provider TEXT NOT NULL CHECK (provider IN ('kofi', 'patreon', 'bmac', 'paypal')),
  event_id TEXT NOT NULL,
  day TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = lower(currency)),
  base_currency TEXT NOT NULL CHECK (length(base_currency) = 3 AND base_currency = lower(base_currency)),
  base_amount_minor INTEGER NOT NULL CHECK (base_amount_minor >= 0),
  needs_rate INTEGER NOT NULL CHECK (needs_rate IN (0, 1)),
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (provider, event_id)
);

INSERT INTO provider_donation_events_v3 (
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
)
SELECT
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
FROM provider_donation_events;

DROP TABLE provider_donation_events;
ALTER TABLE provider_donation_events_v3 RENAME TO provider_donation_events;

CREATE INDEX provider_donation_events_day_base_currency_idx
  ON provider_donation_events (day, base_currency);
