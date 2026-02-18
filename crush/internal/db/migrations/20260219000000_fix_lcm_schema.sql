-- +goose Up
-- +goose StatementBegin

-- ============================================================================
-- Fix DB-1: lcm_summary_messages.message_id ON DELETE CASCADE -> RESTRICT
-- Fix DB-2: lcm_context_items.message_id ON DELETE CASCADE -> RESTRICT
-- Fix DB-10: Add missing original_path index on lcm_large_files
-- Fix DB-11: Add missing summary_id and message_id indexes on lcm_context_items
-- Fix DB-13: Add porter stemming to FTS5 tokenizer
-- ============================================================================

-- --- DB-1: Recreate lcm_summary_messages with ON DELETE RESTRICT ---

CREATE TABLE IF NOT EXISTS lcm_summary_messages_new (
    summary_id  TEXT NOT NULL REFERENCES lcm_summaries(summary_id) ON DELETE CASCADE,
    message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
    ord         INTEGER NOT NULL,
    PRIMARY KEY (summary_id, ord),
    UNIQUE (summary_id, message_id)
);

INSERT OR IGNORE INTO lcm_summary_messages_new (summary_id, message_id, ord)
SELECT summary_id, message_id, ord FROM lcm_summary_messages;

DROP TABLE lcm_summary_messages;

ALTER TABLE lcm_summary_messages_new RENAME TO lcm_summary_messages;

CREATE INDEX IF NOT EXISTS idx_lcm_summary_messages_msg
    ON lcm_summary_messages(message_id);

-- --- DB-2: Recreate lcm_context_items with ON DELETE RESTRICT ---

CREATE TABLE IF NOT EXISTS lcm_context_items_new (
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    item_type   TEXT NOT NULL CHECK(item_type IN ('message', 'summary')),
    message_id  TEXT,
    summary_id  TEXT,
    PRIMARY KEY (session_id, position),
    CHECK (
        (item_type = 'message' AND message_id IS NOT NULL AND summary_id IS NULL) OR
        (item_type = 'summary' AND summary_id IS NOT NULL AND message_id IS NULL)
    ),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
    FOREIGN KEY (summary_id) REFERENCES lcm_summaries(summary_id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO lcm_context_items_new (session_id, position, item_type, message_id, summary_id)
SELECT session_id, position, item_type, message_id, summary_id FROM lcm_context_items;

DROP TABLE lcm_context_items;

ALTER TABLE lcm_context_items_new RENAME TO lcm_context_items;

-- Recreate existing composite index
CREATE INDEX IF NOT EXISTS idx_lcm_context_items_pos
    ON lcm_context_items(session_id, position);

-- DB-11: Add missing individual indexes
CREATE INDEX IF NOT EXISTS idx_lcm_context_items_summary
    ON lcm_context_items(summary_id);

CREATE INDEX IF NOT EXISTS idx_lcm_context_items_message
    ON lcm_context_items(message_id);

-- --- DB-10: Add missing original_path index on lcm_large_files ---

CREATE INDEX IF NOT EXISTS idx_lcm_large_files_path
    ON lcm_large_files(original_path);

-- --- DB-13: Recreate FTS5 with porter stemming ---

-- Drop old triggers first
DROP TRIGGER IF EXISTS lcm_summaries_au;
DROP TRIGGER IF EXISTS lcm_summaries_ad;
DROP TRIGGER IF EXISTS lcm_summaries_ai;

-- Drop old FTS table
DROP TABLE IF EXISTS lcm_summaries_fts;

-- Recreate with porter unicode61 tokenizer for English stemming
CREATE VIRTUAL TABLE IF NOT EXISTS lcm_summaries_fts USING fts5(
    content,
    content=lcm_summaries,
    content_rowid=rowid,
    tokenize='porter unicode61'
);

-- Repopulate FTS from existing data
INSERT INTO lcm_summaries_fts(rowid, content)
SELECT rowid, content FROM lcm_summaries;

-- Recreate triggers
CREATE TRIGGER IF NOT EXISTS lcm_summaries_ai AFTER INSERT ON lcm_summaries BEGIN
    INSERT INTO lcm_summaries_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS lcm_summaries_ad AFTER DELETE ON lcm_summaries BEGIN
    INSERT INTO lcm_summaries_fts(lcm_summaries_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS lcm_summaries_au AFTER UPDATE ON lcm_summaries BEGIN
    INSERT INTO lcm_summaries_fts(lcm_summaries_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
    INSERT INTO lcm_summaries_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Revert FTS5 to default tokenizer
DROP TRIGGER IF EXISTS lcm_summaries_au;
DROP TRIGGER IF EXISTS lcm_summaries_ad;
DROP TRIGGER IF EXISTS lcm_summaries_ai;
DROP TABLE IF EXISTS lcm_summaries_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS lcm_summaries_fts USING fts5(
    content,
    content=lcm_summaries,
    content_rowid=rowid
);

INSERT INTO lcm_summaries_fts(rowid, content)
SELECT rowid, content FROM lcm_summaries;

CREATE TRIGGER IF NOT EXISTS lcm_summaries_ai AFTER INSERT ON lcm_summaries BEGIN
    INSERT INTO lcm_summaries_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS lcm_summaries_ad AFTER DELETE ON lcm_summaries BEGIN
    INSERT INTO lcm_summaries_fts(lcm_summaries_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS lcm_summaries_au AFTER UPDATE ON lcm_summaries BEGIN
    INSERT INTO lcm_summaries_fts(lcm_summaries_fts, rowid, content)
        VALUES('delete', old.rowid, old.content);
    INSERT INTO lcm_summaries_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- Revert indexes
DROP INDEX IF EXISTS idx_lcm_large_files_path;
DROP INDEX IF EXISTS idx_lcm_context_items_message;
DROP INDEX IF EXISTS idx_lcm_context_items_summary;

-- Revert lcm_context_items to CASCADE
CREATE TABLE IF NOT EXISTS lcm_context_items_old (
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    item_type   TEXT NOT NULL CHECK(item_type IN ('message', 'summary')),
    message_id  TEXT,
    summary_id  TEXT,
    PRIMARY KEY (session_id, position),
    CHECK (
        (item_type = 'message' AND message_id IS NOT NULL AND summary_id IS NULL) OR
        (item_type = 'summary' AND summary_id IS NOT NULL AND message_id IS NULL)
    ),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (summary_id) REFERENCES lcm_summaries(summary_id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO lcm_context_items_old SELECT * FROM lcm_context_items;
DROP TABLE lcm_context_items;
ALTER TABLE lcm_context_items_old RENAME TO lcm_context_items;

CREATE INDEX IF NOT EXISTS idx_lcm_context_items_pos
    ON lcm_context_items(session_id, position);

-- Revert lcm_summary_messages to CASCADE
CREATE TABLE IF NOT EXISTS lcm_summary_messages_old (
    summary_id  TEXT NOT NULL REFERENCES lcm_summaries(summary_id) ON DELETE CASCADE,
    message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    ord         INTEGER NOT NULL,
    PRIMARY KEY (summary_id, ord),
    UNIQUE (summary_id, message_id)
);

INSERT OR IGNORE INTO lcm_summary_messages_old SELECT * FROM lcm_summary_messages;
DROP TABLE lcm_summary_messages;
ALTER TABLE lcm_summary_messages_old RENAME TO lcm_summary_messages;

CREATE INDEX IF NOT EXISTS idx_lcm_summary_messages_msg
    ON lcm_summary_messages(message_id);

-- +goose StatementEnd
