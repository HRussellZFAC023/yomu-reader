-- Pitch accents for pitch-aware TTS (x-amazon-pron-kana `ph` values).
-- Populate: node ../../scripts/build-pitch-accents-sql.mjs
-- Import:   npx wrangler d1 execute yomu-audio-db --remote --file=data/pitch_accents.sql
-- Schema matches yomitan-ultimate-audio so its entry_and_pitch_db.sql imports too.
CREATE TABLE IF NOT EXISTS pitch_accents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expression TEXT NOT NULL,
    reading TEXT NOT NULL,
    pitch TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pitch_expression ON pitch_accents (expression);
CREATE INDEX IF NOT EXISTS idx_pitch_expression_reading ON pitch_accents (expression, reading);
