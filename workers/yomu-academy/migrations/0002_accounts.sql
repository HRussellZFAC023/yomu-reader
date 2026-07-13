-- Optional Academy accounts and privacy-preserving class progress.
-- Google profile data and learning-event payloads are deliberately absent:
-- only an HMAC of Google's stable `sub`, Academy-owned identity fields,
-- aggregate counters, and UTC study dates are retained.

PRAGMA foreign_keys = ON;

CREATE TABLE classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    archived_at INTEGER
);

ALTER TABLE invites ADD COLUMN class_id TEXT REFERENCES classes(id);
CREATE INDEX idx_invites_class_id ON invites(class_id);

CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    google_sub_hash TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT 'Learner',
    name_chosen INTEGER NOT NULL DEFAULT 0 CHECK (name_chosen IN (0, 1)),
    discriminator TEXT NOT NULL UNIQUE
        CHECK (length(discriminator) = 6 AND discriminator NOT GLOB '*[^0-9]*'),
    avatar_key TEXT CHECK (avatar_key IS NULL OR avatar_key IN ('quality-2', 'quality-3', 'quality-4', 'quality-5')),
    board_visible INTEGER NOT NULL DEFAULT 0 CHECK (board_visible IN (0, 1)),
    share_avatar INTEGER NOT NULL DEFAULT 0 CHECK (share_avatar IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

ALTER TABLE sessions ADD COLUMN account_id TEXT REFERENCES accounts(id);
CREATE INDEX idx_sessions_account_id ON sessions(account_id);

CREATE TABLE oauth_flows (
    state_hash TEXT PRIMARY KEY,
    session_public_id TEXT NOT NULL REFERENCES sessions(public_id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    CHECK (expires_at > created_at)
);
CREATE INDEX idx_oauth_flows_expiry ON oauth_flows(expires_at);

CREATE TABLE class_memberships (
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'sensei')),
    board_hidden INTEGER NOT NULL DEFAULT 0 CHECK (board_hidden IN (0, 1)),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (class_id, account_id)
);
CREATE INDEX idx_class_memberships_account ON class_memberships(account_id);

CREATE TABLE progress_imports (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    mutation_id TEXT NOT NULL,
    guard TEXT NOT NULL UNIQUE,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, mutation_id)
);

CREATE TABLE progress_snapshots (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    known_word_count INTEGER NOT NULL DEFAULT 0 CHECK (known_word_count >= 0),
    reviews_completed INTEGER NOT NULL DEFAULT 0 CHECK (reviews_completed >= 0),
    reviews_due INTEGER NOT NULL DEFAULT 0 CHECK (reviews_due >= 0),
    lessons_completed INTEGER NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
    lessons_total INTEGER NOT NULL DEFAULT 0 CHECK (lessons_total >= 0),
    updated_at INTEGER NOT NULL,
    CHECK (lessons_completed <= lessons_total)
);

CREATE TABLE study_days (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    study_date TEXT NOT NULL
        CHECK (length(study_date) = 10 AND study_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    PRIMARY KEY (account_id, study_date)
);
