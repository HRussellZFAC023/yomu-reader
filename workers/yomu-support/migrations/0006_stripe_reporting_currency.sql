-- Keep Stripe's native receipt amount while locking the first available GBP
-- reporting conversion. Existing GBP rows are exact; historical foreign rows
-- remain pending until a fresh rate is available.

-- Two Stripe event types may describe one paid Checkout session. If historical
-- duplicates exist, stop the supervised migration for reconciliation rather
-- than deleting financial evidence.
CREATE UNIQUE INDEX donation_events_stripe_session_id_uq
  ON donation_events (stripe_session_id);

ALTER TABLE donation_events
  ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'gbp'
  CHECK (length(base_currency) = 3 AND base_currency = lower(base_currency));

ALTER TABLE donation_events
  ADD COLUMN base_amount_minor INTEGER NOT NULL DEFAULT 0
  CHECK (base_amount_minor >= 0);

ALTER TABLE donation_events
  ADD COLUMN needs_rate INTEGER NOT NULL DEFAULT 1
  CHECK (needs_rate IN (0, 1));

UPDATE donation_events
SET
  base_amount_minor = amount_minor,
  needs_rate = 0
WHERE lower(currency) = 'gbp';

CREATE INDEX donation_events_day_base_currency_idx
  ON donation_events (day, base_currency);
