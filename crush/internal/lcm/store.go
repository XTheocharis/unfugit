package lcm

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/charmbracelet/crush/internal/db"
)

// escNull escapes null bytes that can corrupt FTS5 indexing.
// Matches Volt's escNull: s.replaceAll("\0", "\\x00")
func escNull(s string) string {
	return strings.ReplaceAll(s, "\x00", "\\x00")
}

// SQLiteStore implements the Store interface backed by sqlc-generated queries.
type SQLiteStore struct {
	q  *db.Queries
	db *sql.DB
}

// NewSQLiteStore creates a new SQLiteStore.
func NewSQLiteStore(queries *db.Queries, database *sql.DB) *SQLiteStore {
	return &SQLiteStore{q: queries, db: database}
}

func (s *SQLiteStore) GetCurrentContext(ctx context.Context, sessionID string) ([]ContextEntry, error) {
	rows, err := s.q.LCMGetCurrentContext(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	entries := make([]ContextEntry, len(rows))
	for i, row := range rows {
		var msgID, sumID *string
		if row.MessageID.Valid {
			msgID = &row.MessageID.String
		}
		if row.SummaryID.Valid {
			sumID = &row.SummaryID.String
		}

		// token_count comes as interface{} from sqlc because of the CASE expression.
		tokenCount := 0
		switch tc := row.TokenCount.(type) {
		case int64:
			tokenCount = int(tc)
		case float64:
			tokenCount = int(tc)
		}

		entries[i] = ContextEntry{
			Position:    int(row.Position),
			ItemType:    row.ItemType,
			MessageID:   msgID,
			SummaryID:   sumID,
			Role:        row.Role,
			Content:     row.Content,
			TokenCount:  tokenCount,
			SummaryKind: row.SummaryKind,
		}
	}
	return entries, nil
}

func (s *SQLiteStore) GetContextTokenCount(ctx context.Context, sessionID string) (int, error) {
	result, err := s.q.LCMGetContextTokenCount(ctx, sessionID)
	if err != nil {
		return 0, err
	}
	// sqlc returns interface{} for COALESCE(SUM(CASE...)); handle both int64 and float64.
	var rawTotal int
	switch v := result.(type) {
	case int64:
		rawTotal = int(v)
	case float64:
		rawTotal = int(v)
	}

	// Add summary formatting overhead (SQ-21): the SQL query returns raw token counts
	// but Volt includes the [Summary ID: ...] and [Parent Summaries: ...] headers.
	// Query the number of summaries and add a per-summary overhead estimate.
	summaryCount, err := s.q.LCMCountSummariesInContext(ctx, sessionID)
	if err != nil {
		return rawTotal, nil // Fall back to raw total on error
	}
	// Each summary has at least "[Summary ID: sum_xxxxxxxxxxxxxxxx]\n\n" ≈ 10 tokens overhead.
	// Condensed summaries also have "[Parent Summaries: sum_xxx, sum_yyy]\n" adding more.
	// Use a conservative per-summary estimate of 10 tokens.
	const perSummaryOverhead = 10
	return rawTotal + int(summaryCount)*perSummaryOverhead, nil
}

func (s *SQLiteStore) ReplacePositionsWithSummary(ctx context.Context, sessionID string, positions []int, summaryID string) error {
	return ReplacePositionsWithSummary(ctx, s.db, sessionID, positions, summaryID)
}

func (s *SQLiteStore) AppendContextItem(ctx context.Context, sessionID string, itemType string, messageID *string, summaryID *string) error {
	var msgID, sumID sql.NullString
	if messageID != nil {
		msgID = sql.NullString{String: *messageID, Valid: true}
	}
	if summaryID != nil {
		sumID = sql.NullString{String: *summaryID, Valid: true}
	}
	return s.q.LCMAppendContextItem(ctx, db.LCMAppendContextItemParams{
		SessionID: sessionID,
		ItemType:  itemType,
		MessageID: msgID,
		SummaryID: sumID,
	})
}

func (s *SQLiteStore) GetMessagesToSummarize(ctx context.Context, sessionID string, rowLimit int) ([]ContextEntry, error) {
	rows, err := s.q.LCMGetMessagesToSummarize(ctx, db.LCMGetMessagesToSummarizeParams{
		SessionID: sessionID,
		Limit:     int64(rowLimit),
	})
	if err != nil {
		return nil, err
	}
	entries := make([]ContextEntry, len(rows))
	for i, row := range rows {
		var msgID, sumID *string
		if row.MessageID.Valid {
			msgID = &row.MessageID.String
		}
		if row.SummaryID.Valid {
			sumID = &row.SummaryID.String
		}
		entries[i] = ContextEntry{
			Position:  int(row.Position),
			ItemType:  row.ItemType,
			MessageID: msgID,
			SummaryID: sumID,
		}
	}
	return entries, nil
}

func (s *SQLiteStore) GetMessagesByIDs(ctx context.Context, ids []string) ([]LCMMessage, error) {
	// sqlc doesn't support sqlc.slice for SQLite — loop over individual queries.
	messages := make([]LCMMessage, 0, len(ids))
	for _, id := range ids {
		row, err := s.q.LCMGetMessageByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("failed to get message %s: %w", id, err)
		}
		// E12: prefer pre-computed token_count from DB, fallback to estimation
		tokenCount := int(row.TokenCount)
		if tokenCount == 0 {
			tokenCount = EstimateTokenCount(row.Content)
		}
		messages = append(messages, LCMMessage{
			ID:         row.ID,
			SessionID:  row.SessionID,
			CreatedAt:  row.CreatedAt,
			Role:       row.Role,
			Content:    row.Content,
			TokenCount: tokenCount,
		})
	}
	return messages, nil
}

// GetMessagesToSummarizeByTokenBudget returns oldest messages fitting within a token budget (Phase 3.2).
func (s *SQLiteStore) GetMessagesToSummarizeByTokenBudget(ctx context.Context, sessionID string, tokenBudget int) ([]ContextEntry, error) {
	rows, err := s.q.LCMGetMessagesToSummarizeByTokenBudget(ctx, db.LCMGetMessagesToSummarizeByTokenBudgetParams{
		SessionID:   sessionID,
		TokenBudget: int64(tokenBudget),
	})
	if err != nil {
		return nil, err
	}
	entries := make([]ContextEntry, len(rows))
	for i, row := range rows {
		var msgID, sumID *string
		if row.MessageID.Valid {
			msgID = &row.MessageID.String
		}
		if row.SummaryID.Valid {
			sumID = &row.SummaryID.String
		}
		entries[i] = ContextEntry{
			Position:  int(row.Position),
			ItemType:  row.ItemType,
			MessageID: msgID,
			SummaryID: sumID,
		}
	}
	return entries, nil
}

func (s *SQLiteStore) CountMessagesInContext(ctx context.Context, sessionID string) (int, error) {
	count, err := s.q.LCMCountMessagesInContext(ctx, sessionID)
	return int(count), err
}

func (s *SQLiteStore) InsertLeafSummary(ctx context.Context, summary *Summary, messageIDs []string) error {
	fileIDsJSON, err := json.Marshal(summary.FileIDs)
	if err != nil {
		return fmt.Errorf("failed to marshal file IDs: %w", err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Escape null bytes to prevent FTS5 corruption (SQ-15).
	safeContent := escNull(summary.Content)

	qtx := s.q.WithTx(tx)
	if err := qtx.LCMInsertSummary(ctx, db.LCMInsertSummaryParams{
		SummaryID:  summary.SummaryID,
		SessionID:  summary.SessionID,
		Kind:       summary.Kind,
		Content:    safeContent,
		TokenCount: summary.TokenCount,
		FileIds:    string(fileIDsJSON),
	}); err != nil {
		return err
	}
	for i, msgID := range messageIDs {
		if err := qtx.LCMInsertSummaryMessage(ctx, db.LCMInsertSummaryMessageParams{
			SummaryID: summary.SummaryID,
			MessageID: msgID,
			Ord:       int64(i),
		}); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *SQLiteStore) InsertCondensedSummary(ctx context.Context, summary *Summary, parentIDs []string) error {
	fileIDsJSON, err := json.Marshal(summary.FileIDs)
	if err != nil {
		return fmt.Errorf("failed to marshal file IDs: %w", err)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Escape null bytes to prevent FTS5 corruption (SQ-15).
	safeContent := escNull(summary.Content)

	qtx := s.q.WithTx(tx)
	if err := qtx.LCMInsertSummary(ctx, db.LCMInsertSummaryParams{
		SummaryID:  summary.SummaryID,
		SessionID:  summary.SessionID,
		Kind:       summary.Kind,
		Content:    safeContent,
		TokenCount: summary.TokenCount,
		FileIds:    string(fileIDsJSON),
	}); err != nil {
		return err
	}
	for i, parentID := range parentIDs {
		if err := qtx.LCMInsertSummaryParent(ctx, db.LCMInsertSummaryParentParams{
			SummaryID:       summary.SummaryID,
			ParentSummaryID: parentID,
			Ord:             int64(i),
		}); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *SQLiteStore) GetSummariesByIDs(ctx context.Context, ids []string) ([]Summary, error) {
	summaries := make([]Summary, 0, len(ids))
	for _, id := range ids {
		row, err := s.q.LCMGetSummaryByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("failed to get summary %s: %w", id, err)
		}
		var fileIDs []string
		if err := json.Unmarshal([]byte(row.FileIds), &fileIDs); err != nil {
			fileIDs = []string{}
		}
		summaries = append(summaries, Summary{
			SummaryID:  row.SummaryID,
			SessionID:  row.SessionID,
			Kind:       row.Kind,
			Content:    row.Content,
			TokenCount: row.TokenCount,
			FileIDs:    fileIDs,
		})
	}
	return summaries, nil
}

func (s *SQLiteStore) GetSummaryParentIDs(ctx context.Context, summaryID string) ([]string, error) {
	return s.q.LCMGetSummaryParentIDs(ctx, summaryID)
}

func (s *SQLiteStore) GetOldestSummariesInContext(ctx context.Context, sessionID string, limit int) ([]ContextEntry, error) {
	rows, err := s.q.LCMGetOldestSummariesInContext(ctx, db.LCMGetOldestSummariesInContextParams{
		SessionID: sessionID,
		Limit:     int64(limit),
	})
	if err != nil {
		return nil, err
	}
	entries := make([]ContextEntry, len(rows))
	for i, row := range rows {
		var msgID, sumID *string
		if row.MessageID.Valid {
			msgID = &row.MessageID.String
		}
		if row.SummaryID.Valid {
			sumID = &row.SummaryID.String
		}
		entries[i] = ContextEntry{
			Position:  int(row.Position),
			ItemType:  row.ItemType,
			MessageID: msgID,
			SummaryID: sumID,
		}
	}
	return entries, nil
}

func (s *SQLiteStore) CountSummariesInContext(ctx context.Context, sessionID string) (int, error) {
	count, err := s.q.LCMCountSummariesInContext(ctx, sessionID)
	return int(count), err
}

func (s *SQLiteStore) ExpandSummaryToMessages(ctx context.Context, summaryID string) ([]LCMMessage, error) {
	rows, err := s.q.LCMExpandSummaryToMessages(ctx, summaryID)
	if err != nil {
		return nil, err
	}
	messages := make([]LCMMessage, len(rows))
	for i, row := range rows {
		// E12: prefer pre-computed token_count from DB
		tokenCount := int(row.TokenCount)
		if tokenCount == 0 {
			tokenCount = EstimateTokenCount(row.Content)
		}
		messages[i] = LCMMessage{
			ID:         row.ID,
			SessionID:  row.SessionID,
			CreatedAt:  row.CreatedAt,
			Role:       row.Role,
			Content:    row.Content,
			TokenCount: tokenCount,
		}
	}
	return messages, nil
}

func (s *SQLiteStore) InsertLargeFileFromPath(ctx context.Context, sessionID string, filePath string, mimeType string) (*LargeFile, error) {
	stat, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}
	fileSize := stat.Size()
	mtime := stat.ModTime()
	fileID := GenerateFileIDFromPath(sessionID, filePath, fileSize, mtime)
	tokenCount := EstimateTokenCountFromBytes(fileSize)

	if err := s.q.LCMInsertLargeFile(ctx, db.LCMInsertLargeFileParams{
		FileID:       fileID,
		SessionID:    sessionID,
		OriginalPath: filePath,
		MimeType:     mimeType,
		TokenCount:   tokenCount,
	}); err != nil {
		return nil, err
	}

	return &LargeFile{
		FileID:       fileID,
		SessionID:    sessionID,
		OriginalPath: filePath,
		MimeType:     mimeType,
		TokenCount:   tokenCount,
	}, nil
}

func (s *SQLiteStore) GetLargeFile(ctx context.Context, fileID string) (*LargeFile, error) {
	row, err := s.q.LCMGetLargeFile(ctx, fileID)
	if err != nil {
		return nil, fmt.Errorf("failed to get large file %s: %w", fileID, err)
	}
	return &LargeFile{
		FileID:             row.FileID,
		SessionID:          row.SessionID,
		OriginalPath:       row.OriginalPath,
		MimeType:           row.MimeType,
		TokenCount:         row.TokenCount,
		CreatedAt:          row.CreatedAt,
		ExplorationSummary: row.ExplorationSummary.String,
		ExplorerUsed:       row.ExplorerUsed.String,
	}, nil
}

func (s *SQLiteStore) GetAllSummaries(ctx context.Context, sessionID string) ([]Summary, error) {
	rows, err := s.q.LCMGetAllSummaries(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	summaries := make([]Summary, len(rows))
	for i, row := range rows {
		var fileIDs []string
		if err := json.Unmarshal([]byte(row.FileIds), &fileIDs); err != nil {
			fileIDs = []string{}
		}
		summaries[i] = Summary{
			SummaryID:  row.SummaryID,
			SessionID:  row.SessionID,
			Kind:       row.Kind,
			Content:    row.Content,
			TokenCount: row.TokenCount,
			FileIDs:    fileIDs,
		}
	}
	return summaries, nil
}

func (s *SQLiteStore) DeleteSummary(ctx context.Context, summaryID string) error {
	return s.q.LCMDeleteSummary(ctx, summaryID)
}

func (s *SQLiteStore) GetChildSummaryIDs(ctx context.Context, summaryID string) ([]string, error) {
	return s.q.LCMGetChildSummaryIDs(ctx, summaryID)
}

func (s *SQLiteStore) GetCoveringSummary(ctx context.Context, sessionID string, minMessages int) (*Summary, error) {
	row, err := s.q.LCMGetCoveringSummaryForMessages(ctx, db.LCMGetCoveringSummaryForMessagesParams{
		SessionID:   sessionID,
		MinMessages: int64(minMessages),
	})
	if err != nil {
		return nil, err
	}
	var fileIDs []string
	if err := json.Unmarshal([]byte(row.FileIds), &fileIDs); err != nil {
		fileIDs = []string{}
	}
	return &Summary{
		SummaryID:  row.SummaryID,
		SessionID:  row.SessionID,
		Kind:       row.Kind,
		Content:    row.Content,
		TokenCount: row.TokenCount,
		FileIDs:    fileIDs,
	}, nil
}

func (s *SQLiteStore) GetAncestorSessionIDs(ctx context.Context, summaryID string) ([]string, error) {
	return s.q.LCMGetSummaryMessageSessionIDs(ctx, summaryID)
}

func (s *SQLiteStore) GetSessionConfig(ctx context.Context, sessionID string) (*SessionConfig, error) {
	row, err := s.q.LCMGetSessionConfig(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	config := &SessionConfig{
		SessionID:         row.SessionID,
		ModelName:         row.ModelName,
		ModelCtxMaxTokens: row.ModelCtxMaxTokens,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
	if row.CtxCutoffThreshold.Valid {
		v := int(row.CtxCutoffThreshold.Int64)
		config.CtxCutoffThreshold = &v
	}
	return config, nil
}

func (s *SQLiteStore) SetSessionConfig(ctx context.Context, config *SessionConfig) error {
	var threshold sql.NullInt64
	if config.CtxCutoffThreshold != nil {
		threshold = sql.NullInt64{Int64: int64(*config.CtxCutoffThreshold), Valid: true}
	}
	return s.q.LCMUpsertSessionConfig(ctx, db.LCMUpsertSessionConfigParams{
		SessionID:          config.SessionID,
		ModelName:          config.ModelName,
		ModelCtxMaxTokens:  config.ModelCtxMaxTokens,
		CtxCutoffThreshold: threshold,
	})
}

// SearchMessages performs FTS5 full-text search across session messages (DB-23).
// Implemented with raw SQL because sqlc cannot introspect FTS5 virtual tables.
// E19: includes m.token_count in SELECT.
func (s *SQLiteStore) SearchMessages(ctx context.Context, sessionID string, query string, limit int) ([]LCMMessage, error) {
	safe := "\"" + strings.ReplaceAll(query, "\"", " ") + "\""

	rows, err := s.db.QueryContext(ctx,
		`SELECT m.id, m.session_id, m.role, m.parts, m.created_at,
		        COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4) AS token_count
		 FROM messages_fts fts
		 JOIN messages m ON m.rowid = fts.rowid
		 WHERE messages_fts MATCH ?
		 AND m.session_id = ?
		 ORDER BY m.created_at DESC
		 LIMIT ?`, safe, sessionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []LCMMessage
	for rows.Next() {
		var msg LCMMessage
		if err := rows.Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Content, &msg.CreatedAt, &msg.TokenCount); err != nil {
			return nil, err
		}
		if msg.TokenCount == 0 {
			msg.TokenCount = EstimateTokenCount(msg.Content)
		}
		messages = append(messages, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return messages, nil
}

// SearchMessagesRegex performs regex-based search on message content (DB-24).
// SQLite's built-in REGEXP requires a driver-specific user function, so this
// fetches candidate messages with a session filter and applies Go's regexp
// for matching. Results are capped at limit.
// E19: includes m.token_count in SELECT.
func (s *SQLiteStore) SearchMessagesRegex(ctx context.Context, sessionID string, pattern string, limit int) ([]LCMMessage, error) {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("invalid regex pattern: %w", err)
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT m.id, m.session_id, m.role, m.parts, m.created_at,
		        COALESCE(m.token_count, (LENGTH(COALESCE(m.parts, '')) + 3) / 4) AS token_count
		 FROM messages m
		 WHERE m.session_id = ?
		 ORDER BY m.created_at DESC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []LCMMessage
	for rows.Next() && len(messages) < limit {
		var msg LCMMessage
		if err := rows.Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Content, &msg.CreatedAt, &msg.TokenCount); err != nil {
			return nil, err
		}
		if re.MatchString(msg.Content) {
			if msg.TokenCount == 0 {
				msg.TokenCount = EstimateTokenCount(msg.Content)
			}
			messages = append(messages, msg)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return messages, nil
}

// --- Exploration cache (Phase 5.2, E17) ---

// GetLargeFileExploration retrieves cached exploration result for a large file.
// E17: derives FileIDs and TokenCount from the cached summary text.
func (s *SQLiteStore) GetLargeFileExploration(ctx context.Context, fileID string) (*ExplorationResult, error) {
	row, err := s.q.LCMGetLargeFileExploration(ctx, fileID)
	if err != nil {
		return nil, err
	}
	if !row.ExplorationSummary.Valid || row.ExplorationSummary.String == "" {
		return nil, fmt.Errorf("no exploration cached for file %s", fileID)
	}
	return &ExplorationResult{
		Summary:      row.ExplorationSummary.String,
		FileIDs:      extractFileIDs(row.ExplorationSummary.String),
		TokenCount:   EstimateTokenCount(row.ExplorationSummary.String),
		ExplorerUsed: row.ExplorerUsed.String,
	}, nil
}

// SetLargeFileExploration caches an exploration result for a large file.
func (s *SQLiteStore) SetLargeFileExploration(ctx context.Context, fileID string, result *ExplorationResult) error {
	return s.q.LCMUpdateLargeFileExploration(ctx, db.LCMUpdateLargeFileExplorationParams{
		ExplorationSummary: sql.NullString{String: result.Summary, Valid: true},
		ExplorerUsed:       sql.NullString{String: result.ExplorerUsed, Valid: true},
		FileID:             fileID,
	})
}

// --- Agentic map operations (Phase 6) ---

func (s *SQLiteStore) CreateAgenticMapRun(ctx context.Context, run *AgenticMapRun) error {
	return s.q.CreateAgenticMapRun(ctx, db.CreateAgenticMapRunParams{
		MapID:          run.MapID,
		Status:         run.Status,
		InputPath:      sql.NullString{String: run.InputPath, Valid: run.InputPath != ""},
		Prompt:         sql.NullString{String: run.Prompt, Valid: run.Prompt != ""},
		OutputSchema:   sql.NullString{String: run.OutputSchema, Valid: run.OutputSchema != ""},
		ReadOnly:       boolToInt64(run.ReadOnly),
		Concurrency:    int64(run.Concurrency),
		TimeoutSeconds: int64(run.TimeoutSeconds),
		MaxAttempts:    int64(run.MaxAttempts),
	})
}

func (s *SQLiteStore) GetAgenticMapRun(ctx context.Context, mapID string) (*AgenticMapRun, error) {
	row, err := s.q.GetAgenticMapRun(ctx, mapID)
	if err != nil {
		return nil, err
	}
	return &AgenticMapRun{
		MapID:          row.MapID,
		RunStartedAt:   row.RunStartedAt,
		Status:         row.Status,
		InputPath:      row.InputPath.String,
		InputLcmID:     row.InputLcmID.String,
		OutputPath:     row.OutputPath.String,
		OutputLcmID:    row.OutputLcmID.String,
		Prompt:         row.Prompt.String,
		OutputSchema:   row.OutputSchema.String,
		ReadOnly:       row.ReadOnly != 0,
		Concurrency:    int(row.Concurrency),
		TimeoutSeconds: int(row.TimeoutSeconds),
		MaxAttempts:    int(row.MaxAttempts),
	}, nil
}

func (s *SQLiteStore) UpdateAgenticMapRunStatus(ctx context.Context, mapID, status string) error {
	return s.q.UpdateAgenticMapRunStatus(ctx, db.UpdateAgenticMapRunStatusParams{
		MapID:  mapID,
		Status: status,
	})
}

func (s *SQLiteStore) CreateAgenticMapItem(ctx context.Context, item *AgenticMapItem) error {
	return s.q.CreateAgenticMapItem(ctx, db.CreateAgenticMapItemParams{
		MapID:     item.MapID,
		ItemIndex: int64(item.ItemIndex),
		Item:      item.Item,
		Status:    item.Status,
	})
}

func (s *SQLiteStore) UpdateAgenticMapItem(ctx context.Context, item *AgenticMapItem) error {
	return s.q.UpdateAgenticMapItem(ctx, db.UpdateAgenticMapItemParams{
		MapID:        item.MapID,
		ItemIndex:    int64(item.ItemIndex),
		Status:       item.Status,
		AttemptsUsed: int64(item.AttemptsUsed),
		StartedAt:    sql.NullInt64{Int64: item.StartedAt, Valid: item.StartedAt != 0},
		FinishedAt:   sql.NullInt64{Int64: item.FinishedAt, Valid: item.FinishedAt != 0},
		Result:       sql.NullString{String: item.Result, Valid: item.Result != ""},
		Error:        sql.NullString{String: item.Error, Valid: item.Error != ""},
	})
}

func (s *SQLiteStore) GetAgenticMapItemsByStatus(ctx context.Context, mapID, status string) ([]AgenticMapItem, error) {
	rows, err := s.q.GetAgenticMapItemsByStatus(ctx, db.GetAgenticMapItemsByStatusParams{
		MapID:  mapID,
		Status: status,
	})
	if err != nil {
		return nil, err
	}
	items := make([]AgenticMapItem, len(rows))
	for i, row := range rows {
		items[i] = AgenticMapItem{
			MapID:        row.MapID,
			ItemIndex:    int(row.ItemIndex),
			Item:         row.Item,
			Status:       row.Status,
			AttemptsUsed: int(row.AttemptsUsed),
			StartedAt:    row.StartedAt.Int64,
			FinishedAt:   row.FinishedAt.Int64,
			Result:       row.Result.String,
			Error:        row.Error.String,
		}
	}
	return items, nil
}

// --- LLM map operations (Phase 6) ---

func (s *SQLiteStore) CreateLlmMapRun(ctx context.Context, run *LlmMapRun) error {
	return s.q.CreateLlmMapRun(ctx, db.CreateLlmMapRunParams{
		MapID:          run.MapID,
		Status:         run.Status,
		InputPath:      sql.NullString{String: run.InputPath, Valid: run.InputPath != ""},
		Prompt:         sql.NullString{String: run.Prompt, Valid: run.Prompt != ""},
		OutputSchema:   sql.NullString{String: run.OutputSchema, Valid: run.OutputSchema != ""},
		Model:          sql.NullString{String: run.Model, Valid: run.Model != ""},
		Concurrency:    int64(run.Concurrency),
		TimeoutSeconds: int64(run.TimeoutSeconds),
		MaxAttempts:    int64(run.MaxAttempts),
	})
}

func (s *SQLiteStore) GetLlmMapRun(ctx context.Context, mapID string) (*LlmMapRun, error) {
	row, err := s.q.GetLlmMapRun(ctx, mapID)
	if err != nil {
		return nil, err
	}
	return &LlmMapRun{
		MapID:                    row.MapID,
		RunStartedAt:             row.RunStartedAt,
		Status:                   row.Status,
		InputPath:                row.InputPath.String,
		InputLcmID:               row.InputLcmID.String,
		OutputPath:               row.OutputPath.String,
		OutputLcmID:              row.OutputLcmID.String,
		Prompt:                   row.Prompt.String,
		OutputSchema:             row.OutputSchema.String,
		Model:                    row.Model.String,
		Concurrency:              int(row.Concurrency),
		TimeoutSeconds:           int(row.TimeoutSeconds),
		MaxAttempts:              int(row.MaxAttempts),
		ResolvedProvider:         row.ResolvedProvider.String,
		ResolvedModel:            row.ResolvedModel.String,
		ResolvedRequestOverrides: row.ResolvedRequestOverrides.String,
	}, nil
}

func (s *SQLiteStore) UpdateLlmMapRunStatus(ctx context.Context, mapID, status string) error {
	return s.q.UpdateLlmMapRunStatus(ctx, db.UpdateLlmMapRunStatusParams{
		MapID:  mapID,
		Status: status,
	})
}

func (s *SQLiteStore) CreateLlmMapItem(ctx context.Context, item *LlmMapItem) error {
	return s.q.CreateLlmMapItem(ctx, db.CreateLlmMapItemParams{
		MapID:     item.MapID,
		ItemIndex: int64(item.ItemIndex),
		Item:      item.Item,
		Status:    item.Status,
	})
}

func (s *SQLiteStore) UpdateLlmMapItem(ctx context.Context, item *LlmMapItem) error {
	return s.q.UpdateLlmMapItem(ctx, db.UpdateLlmMapItemParams{
		MapID:        item.MapID,
		ItemIndex:    int64(item.ItemIndex),
		Status:       item.Status,
		AttemptsUsed: int64(item.AttemptsUsed),
		StartedAt:    sql.NullInt64{Int64: item.StartedAt, Valid: item.StartedAt != 0},
		FinishedAt:   sql.NullInt64{Int64: item.FinishedAt, Valid: item.FinishedAt != 0},
		Result:       sql.NullString{String: item.Result, Valid: item.Result != ""},
		Error:        sql.NullString{String: item.Error, Valid: item.Error != ""},
	})
}

func (s *SQLiteStore) GetLlmMapItemsByStatus(ctx context.Context, mapID, status string) ([]LlmMapItem, error) {
	rows, err := s.q.GetLlmMapItemsByStatus(ctx, db.GetLlmMapItemsByStatusParams{
		MapID:  mapID,
		Status: status,
	})
	if err != nil {
		return nil, err
	}
	items := make([]LlmMapItem, len(rows))
	for i, row := range rows {
		items[i] = LlmMapItem{
			MapID:        row.MapID,
			ItemIndex:    int(row.ItemIndex),
			Item:         row.Item,
			Status:       row.Status,
			AttemptsUsed: int(row.AttemptsUsed),
			StartedAt:    row.StartedAt.Int64,
			FinishedAt:   row.FinishedAt.Int64,
			Result:       row.Result.String,
			Error:        row.Error.String,
		}
	}
	return items, nil
}

func boolToInt64(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// SearchSummaries performs FTS5 search. Implemented with raw SQL because
// sqlc cannot introspect FTS5 virtual tables.
func (s *SQLiteStore) SearchSummaries(ctx context.Context, sessionID string, query string, limit int) ([]Summary, error) {
	// Sanitize query for FTS5: wrap in quotes and escape internal quotes.
	safe := "\"" + strings.ReplaceAll(query, "\"", " ") + "\""

	rows, err := s.db.QueryContext(ctx,
		`SELECT s.summary_id, s.session_id, s.kind, s.content, s.token_count, s.file_ids
		 FROM lcm_summaries_fts fts
		 JOIN lcm_summaries s ON s.rowid = fts.rowid
		 WHERE lcm_summaries_fts MATCH ?
		 AND s.session_id = ?
		 ORDER BY s.created_at DESC
		 LIMIT ?`, safe, sessionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []Summary
	for rows.Next() {
		var s Summary
		var fileIDsJSON string
		if err := rows.Scan(&s.SummaryID, &s.SessionID, &s.Kind, &s.Content, &s.TokenCount, &fileIDsJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(fileIDsJSON), &s.FileIDs); err != nil {
			s.FileIDs = []string{}
		}
		summaries = append(summaries, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return summaries, nil
}
