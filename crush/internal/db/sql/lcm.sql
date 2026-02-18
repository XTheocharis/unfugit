-- name: LCMGetCurrentContext :many
SELECT
    ci.position,
    ci.item_type,
    ci.message_id,
    ci.summary_id,
    COALESCE(m.role, 'summary') AS role,
    COALESCE(m.parts, s.content) AS content,
    CASE
        WHEN ci.item_type = 'message' THEN LENGTH(COALESCE(m.parts, '')) / 4
        ELSE COALESCE(s.token_count, 0)
    END AS token_count,
    COALESCE(s.kind, '') AS summary_kind
FROM lcm_context_items ci
LEFT JOIN messages m ON m.id = ci.message_id
LEFT JOIN lcm_summaries s ON s.summary_id = ci.summary_id
WHERE ci.session_id = ?
ORDER BY ci.position;

-- name: LCMGetContextTokenCount :one
SELECT COALESCE(SUM(
    CASE
        WHEN ci.item_type = 'message' THEN LENGTH(COALESCE(m.parts, '')) / 4
        WHEN ci.item_type = 'summary' THEN s.token_count
        ELSE 0
    END
), 0) AS total_tokens
FROM lcm_context_items ci
LEFT JOIN messages m ON m.id = ci.message_id
LEFT JOIN lcm_summaries s ON s.summary_id = ci.summary_id
WHERE ci.session_id = ?;

-- name: LCMAppendContextItem :exec
INSERT INTO lcm_context_items (session_id, position, item_type, message_id, summary_id)
SELECT ?, COALESCE(MAX(ci.position), -1) + 1, ?, ?, ?
FROM lcm_context_items ci
WHERE ci.session_id = sqlc.arg(session_id);

-- name: LCMCountMessagesInContext :one
SELECT COUNT(*) FROM lcm_context_items
WHERE session_id = ? AND item_type = 'message';

-- name: LCMCountSummariesInContext :one
SELECT COUNT(*) FROM lcm_context_items
WHERE session_id = ? AND item_type = 'summary';

-- name: LCMGetMessagesToSummarize :many
SELECT ci.position, ci.item_type, ci.message_id, ci.summary_id
FROM lcm_context_items ci
WHERE ci.session_id = ? AND ci.item_type = 'message'
ORDER BY ci.position
LIMIT ?;

-- name: LCMGetOldestSummariesInContext :many
SELECT ci.position, ci.item_type, ci.message_id, ci.summary_id
FROM lcm_context_items ci
WHERE ci.session_id = ? AND ci.item_type = 'summary'
ORDER BY ci.position
LIMIT ?;

-- name: LCMInsertSummary :exec
INSERT INTO lcm_summaries (summary_id, session_id, kind, content, token_count, file_ids)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(summary_id) DO NOTHING;

-- name: LCMInsertSummaryMessage :exec
INSERT INTO lcm_summary_messages (summary_id, message_id, ord) VALUES (?, ?, ?)
ON CONFLICT(summary_id, message_id) DO NOTHING;

-- name: LCMInsertSummaryParent :exec
INSERT INTO lcm_summary_parents (summary_id, parent_summary_id, ord) VALUES (?, ?, ?)
ON CONFLICT(summary_id, parent_summary_id) DO NOTHING;

-- name: LCMGetSummaryByID :one
SELECT summary_id, session_id, kind, content, token_count, file_ids, created_at
FROM lcm_summaries WHERE summary_id = ?;

-- name: LCMGetSummaryParentIDs :many
SELECT parent_summary_id FROM lcm_summary_parents
WHERE summary_id = ? ORDER BY ord;

-- name: LCMGetMessageByID :one
SELECT m.id, m.session_id, m.role, m.parts AS content, m.created_at
FROM messages m
WHERE m.id = ?;

-- name: LCMExpandSummaryToMessages :many
SELECT m.id, m.session_id, m.role, m.parts AS content, m.created_at
FROM lcm_summary_messages sm
JOIN messages m ON m.id = sm.message_id
WHERE sm.summary_id = ?
ORDER BY sm.ord;

-- FTS5 search query is implemented directly in the SQLiteStore
-- because sqlc cannot introspect FTS5 virtual tables.

-- name: LCMInsertLargeFile :exec
INSERT INTO lcm_large_files (file_id, session_id, original_path, mime_type, token_count)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(file_id) DO NOTHING;

-- name: LCMGetLargeFile :one
SELECT file_id, session_id, original_path, mime_type, token_count, created_at
FROM lcm_large_files WHERE file_id = ?;
