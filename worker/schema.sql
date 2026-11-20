-- D1 schema for Keel "Fields" (binding DB). Apply once:
--   npx wrangler d1 execute keel-fields --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS boards (
  board_id   TEXT PRIMARY KEY,
  defs       TEXT NOT NULL,            -- JSON list of field definitions
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  card_id    TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL,
  vals       TEXT NOT NULL DEFAULT '{}', -- JSON { fieldId: value }
  visible    TEXT,                       -- JSON [fieldId] or NULL = board defaults
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_board ON cards(board_id);
CREATE TABLE IF NOT EXISTS import_samples (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  body       TEXT NOT NULL
);
