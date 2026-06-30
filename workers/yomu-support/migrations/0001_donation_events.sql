CREATE TABLE IF NOT EXISTS donation_events (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL,
  stripe_created_at INTEGER NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS donation_events_day_currency_idx
  ON donation_events (day, currency);
