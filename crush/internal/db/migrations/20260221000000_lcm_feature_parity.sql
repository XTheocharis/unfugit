-- +goose Up
-- +goose StatementBegin

-- Phase 1.1: Add exploration columns to lcm_large_files (DB-7)
ALTER TABLE lcm_large_files ADD COLUMN exploration_summary TEXT;
ALTER TABLE lcm_large_files ADD COLUMN explorer_used TEXT;

-- Phase 1.2: Add token_count column to messages (SQ-1, DB-31)
ALTER TABLE messages ADD COLUMN token_count INTEGER;

-- Backfill using ceiling division to match Go's EstimateTokenCount (E1)
UPDATE messages SET token_count = (LENGTH(COALESCE(parts,'')) + 3) / 4;

-- Auto-populate for future inserts (E5)
CREATE TRIGGER messages_compute_token_count AFTER INSERT ON messages
WHEN NEW.token_count IS NULL
BEGIN
    UPDATE messages SET token_count = (LENGTH(COALESCE(NEW.parts,'')) + 3) / 4
    WHERE id = NEW.id;
END;

-- Phase 1.3: Create message_parts table (DB-4)
CREATE TABLE IF NOT EXISTS message_parts (
    part_id         TEXT PRIMARY KEY,
    message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    session_id      TEXT NOT NULL,
    part_type       TEXT NOT NULL,
    ordinal         INTEGER NOT NULL,
    text_content    TEXT,
    is_ignored      INTEGER,
    is_synthetic    INTEGER,
    tool_call_id    TEXT,
    tool_name       TEXT,
    tool_status     TEXT,
    tool_input      TEXT,  -- JSON
    tool_output     TEXT,
    tool_error      TEXT,
    tool_title      TEXT,
    patch_hash      TEXT,
    patch_files     TEXT,  -- JSON array
    file_mime       TEXT,
    file_name       TEXT,
    file_url        TEXT,
    subtask_prompt  TEXT,
    subtask_desc    TEXT,
    subtask_agent   TEXT,
    step_reason     TEXT,
    step_cost       REAL,
    step_tokens_in  INTEGER,
    step_tokens_out INTEGER,
    snapshot_hash   TEXT,
    compaction_auto INTEGER,
    metadata        TEXT,  -- JSON
    UNIQUE(message_id, ordinal)
);
CREATE INDEX IF NOT EXISTS message_parts_message_idx ON message_parts(message_id);
CREATE INDEX IF NOT EXISTS message_parts_type_idx ON message_parts(part_type);

-- Phase 1.4: Create agentic map tables (DB-5)
CREATE TABLE IF NOT EXISTS agentic_map_runs (
    map_id            TEXT PRIMARY KEY,
    run_started_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    status            TEXT NOT NULL DEFAULT 'PENDING',
    input_path        TEXT,
    input_lcm_id      TEXT,
    output_path       TEXT,
    output_lcm_id     TEXT,
    prompt            TEXT,
    output_schema     TEXT,  -- JSON
    read_only         INTEGER NOT NULL DEFAULT 0,
    concurrency       INTEGER NOT NULL DEFAULT 1,
    timeout_seconds   INTEGER NOT NULL DEFAULT 300,
    max_attempts      INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS agentic_map_items (
    map_id        TEXT NOT NULL REFERENCES agentic_map_runs(map_id) ON DELETE CASCADE,
    item_index    INTEGER NOT NULL,
    item          TEXT NOT NULL,  -- JSON
    status        TEXT NOT NULL DEFAULT 'PENDING',
    attempts_used INTEGER NOT NULL DEFAULT 0,
    started_at    INTEGER,
    finished_at   INTEGER,
    result        TEXT,  -- JSON
    error         TEXT,
    PRIMARY KEY (map_id, item_index)
);
CREATE INDEX IF NOT EXISTS agentic_map_items_status_idx ON agentic_map_items(map_id, status, item_index);

-- Phase 1.5: Create LLM map tables (DB-6)
CREATE TABLE IF NOT EXISTS llm_map_runs (
    map_id                      TEXT PRIMARY KEY,
    run_started_at              INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    status                      TEXT NOT NULL DEFAULT 'PENDING',
    input_path                  TEXT,
    input_lcm_id                TEXT,
    output_path                 TEXT,
    output_lcm_id               TEXT,
    prompt                      TEXT,
    output_schema               TEXT,  -- JSON
    model                       TEXT,
    concurrency                 INTEGER NOT NULL DEFAULT 1,
    timeout_seconds             INTEGER NOT NULL DEFAULT 300,
    max_attempts                INTEGER NOT NULL DEFAULT 3,
    resolved_provider           TEXT,
    resolved_model              TEXT,
    resolved_request_overrides  TEXT   -- JSON
);

CREATE TABLE IF NOT EXISTS llm_map_items (
    map_id        TEXT NOT NULL REFERENCES llm_map_runs(map_id) ON DELETE CASCADE,
    item_index    INTEGER NOT NULL,
    item          TEXT NOT NULL,  -- JSON
    status        TEXT NOT NULL DEFAULT 'PENDING',
    attempts_used INTEGER NOT NULL DEFAULT 0,
    started_at    INTEGER,
    finished_at   INTEGER,
    result        TEXT,  -- JSON
    error         TEXT,
    PRIMARY KEY (map_id, item_index)
);
CREATE INDEX IF NOT EXISTS llm_map_items_status_idx ON llm_map_items(map_id, status, item_index);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS llm_map_items;
DROP TABLE IF EXISTS llm_map_runs;
DROP TABLE IF EXISTS agentic_map_items;
DROP TABLE IF EXISTS agentic_map_runs;
DROP TABLE IF EXISTS message_parts;
DROP TRIGGER IF EXISTS messages_compute_token_count;
-- SQLite doesn't support DROP COLUMN, so we can't easily reverse ALTER TABLEs.
-- The token_count and exploration columns remain but are ignored if unused.
-- +goose StatementEnd
