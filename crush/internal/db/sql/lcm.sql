-- name: LCMGetCurrentContext :many
SELECT
    ci.position,
    ci.item_type,
    ci.message_id,
    ci.summary_id,
    COALESCE(m.role, 'summary') AS role,
    COALESCE(m.parts, s.content) AS content,
    CASE
        WHEN ci.item_type = 'message' THEN COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4)
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
        WHEN ci.item_type = 'message' THEN COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4)
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

-- name: LCMGetMessagesToSummarizeByTokenBudget :many
-- Token-budget windowed selection: returns oldest messages whose cumulative
-- token count fits within the given budget (Phase 3.2, E1 ceiling division).
SELECT sub.position, sub.item_type, sub.message_id, sub.summary_id
FROM (
    SELECT ci.position, ci.item_type, ci.message_id, ci.summary_id,
           SUM(COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4))
               OVER (ORDER BY ci.position) AS running_tokens
    FROM lcm_context_items ci
    LEFT JOIN messages m ON m.id = ci.message_id
    WHERE ci.session_id = ? AND ci.item_type = 'message'
) sub
WHERE sub.running_tokens <= ?;

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
SELECT m.id, m.session_id, m.role, m.parts AS content, m.created_at,
       COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4) AS token_count
FROM messages m
WHERE m.id = ?;

-- name: LCMExpandSummaryToMessages :many
SELECT m.id, m.session_id, m.role, m.parts AS content, m.created_at,
       COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4) AS token_count
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
SELECT file_id, session_id, original_path, mime_type, token_count, created_at,
       exploration_summary, explorer_used
FROM lcm_large_files WHERE file_id = ?;

-- name: LCMUpdateLargeFileExploration :exec
UPDATE lcm_large_files
SET exploration_summary = ?, explorer_used = ?
WHERE file_id = ?;

-- name: LCMGetLargeFileExploration :one
SELECT exploration_summary, explorer_used
FROM lcm_large_files WHERE file_id = ?;

-- ============================================================================
-- DB-26: getChildSummaryIds — find summaries whose parent is the given summary
-- ============================================================================
-- name: LCMGetChildSummaryIDs :many
SELECT summary_id FROM lcm_summary_parents
WHERE parent_summary_id = ? ORDER BY ord;

-- ============================================================================
-- DB-25: getCoveringSummary — find the most recent leaf summary whose
-- source messages are a superset of the given message IDs.
-- ============================================================================
-- name: LCMGetCoveringSummaryForMessages :one
SELECT s.summary_id, s.session_id, s.kind, s.content, s.token_count, s.file_ids, s.created_at
FROM lcm_summaries s
WHERE s.session_id = ?
  AND s.kind = 'leaf'
  AND (
    SELECT COUNT(DISTINCT sm.message_id)
    FROM lcm_summary_messages sm
    WHERE sm.summary_id = s.summary_id
  ) >= ?
ORDER BY s.created_at DESC
LIMIT 1;

-- ============================================================================
-- SQ-2: GetAllSummaries — list all summaries for a session
-- ============================================================================
-- name: LCMGetAllSummaries :many
SELECT summary_id, session_id, kind, content, token_count, file_ids, created_at
FROM lcm_summaries
WHERE session_id = ?
ORDER BY created_at;

-- ============================================================================
-- SQ-2: DeleteSummary — remove a summary and its associated data
-- ============================================================================
-- name: LCMDeleteSummary :exec
DELETE FROM lcm_summaries WHERE summary_id = ?;

-- ============================================================================
-- DB-15/DB-16: Session config queries
-- ============================================================================
-- name: LCMGetSessionConfig :one
SELECT session_id, model_name, model_ctx_max_tokens, ctx_cutoff_threshold, created_at, updated_at
FROM lcm_session_config WHERE session_id = ?;

-- name: LCMUpsertSessionConfig :exec
INSERT INTO lcm_session_config (session_id, model_name, model_ctx_max_tokens, ctx_cutoff_threshold)
VALUES (?, ?, ?, ?)
ON CONFLICT(session_id) DO UPDATE SET
    model_name = excluded.model_name,
    model_ctx_max_tokens = excluded.model_ctx_max_tokens,
    ctx_cutoff_threshold = excluded.ctx_cutoff_threshold,
    updated_at = strftime('%s','now');

-- ============================================================================
-- DB-27: getAncestorConversationIds — find session IDs from the original
-- messages that a summary (or its ancestors) was built from.
-- ============================================================================
-- name: LCMGetSummaryMessageSessionIDs :many
SELECT DISTINCT m.session_id
FROM lcm_summary_messages sm
JOIN messages m ON m.id = sm.message_id
WHERE sm.summary_id = ?;
