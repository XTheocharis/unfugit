-- +goose Up
-- +goose StatementBegin

-- ============================================================================
-- Fix DB-12: Add FTS5 full-text search on messages (matching Volt's capability)
-- Fix DB-15: Store ctx_cutoff_threshold per session
-- Fix DB-16: Store model_name and model_ctx_max_tokens per session
-- Fix DB-9: Document that SQLite INTEGER is 64-bit (equivalent to BIGINT)
-- ============================================================================

-- --- DB-12: FTS5 on messages ---
-- Volt provides full-text search on both messages and summaries.
-- Crush already has FTS5 on summaries; this adds it for messages too.

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    parts,
    content=messages,
    content_rowid=rowid,
    tokenize='porter unicode61'
);

-- Populate FTS from existing message data
INSERT INTO messages_fts(rowid, parts)
SELECT rowid, parts FROM messages;

-- Sync triggers to keep FTS in sync with message CRUD
CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, parts) VALUES (new.rowid, new.parts);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, parts)
        VALUES('delete', old.rowid, old.parts);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, parts)
        VALUES('delete', old.rowid, old.parts);
    INSERT INTO messages_fts(rowid, parts) VALUES (new.rowid, new.parts);
END;

-- --- DB-15/DB-16: LCM session configuration ---
-- Stores per-session LCM settings that Volt keeps in the conversations table.
-- DB-9 note: SQLite INTEGER is a variable-width type that stores values up to
-- 8 bytes (equivalent to BIGINT/int64). No schema change needed for DB-9.

CREATE TABLE IF NOT EXISTS lcm_session_config (
    session_id          TEXT NOT NULL PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    model_name          TEXT NOT NULL DEFAULT '',
    model_ctx_max_tokens INTEGER NOT NULL DEFAULT 128000,
    ctx_cutoff_threshold INTEGER,
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_lcm_session_config_session
    ON lcm_session_config(session_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS lcm_session_config;

DROP TRIGGER IF EXISTS messages_fts_au;
DROP TRIGGER IF EXISTS messages_fts_ad;
DROP TRIGGER IF EXISTS messages_fts_ai;
DROP TABLE IF EXISTS messages_fts;

-- +goose StatementEnd
