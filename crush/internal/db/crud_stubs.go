package db

import (
	"context"
	"database/sql"
)

// ---------------------------------------------------------------------------
// SQL query string constants (stubs for CRUD operations not yet generated)
// ---------------------------------------------------------------------------

const createFile = ""
const createMessage = ""
const createSession = ""
const deleteFile = ""
const deleteMessage = ""
const deleteSession = ""
const deleteSessionFiles = ""
const deleteSessionMessages = ""
const getAverageResponseTime = ""
const getFile = ""
const getFileByPathAndSession = ""
const getFileRead = ""
const getHourDayHeatmap = ""
const getMessage = ""
const getRecentActivity = ""
const getSessionByID = ""
const getToolUsage = ""
const getTotalStats = ""
const getUsageByDay = ""
const getUsageByDayOfWeek = ""
const getUsageByHour = ""
const getUsageByModel = ""
const listAllUserMessages = ""
const listFilesByPath = ""
const listFilesBySession = ""
const listLatestSessionFiles = ""
const listMessagesBySession = ""
const listNewFiles = ""
const listSessionReadFiles = ""
const listSessions = ""
const listUserMessagesBySession = ""
const recordFileRead = ""
const updateMessage = ""
const updateSession = ""
const updateSessionTitleAndUsage = ""

// ---------------------------------------------------------------------------
// Param types
// ---------------------------------------------------------------------------

type CreateFileParams struct {
	ID        string `json:"id"`
	SessionID string `json:"session_id"`
	Path      string `json:"path"`
	Content   string `json:"content"`
	Version   int64  `json:"version"`
}

type CreateMessageParams struct {
	ID               string         `json:"id"`
	SessionID        string         `json:"session_id"`
	Role             string         `json:"role"`
	Parts            string         `json:"parts"`
	Model            sql.NullString `json:"model"`
	Provider         sql.NullString `json:"provider"`
	IsSummaryMessage int64          `json:"is_summary_message"`
	TokenCount       sql.NullInt64  `json:"token_count"`
}

type CreateSessionParams struct {
	ID              string         `json:"id"`
	ParentSessionID sql.NullString `json:"parent_session_id"`
	Title           string         `json:"title"`
}

type GetFileByPathAndSessionParams struct {
	Path      string `json:"path"`
	SessionID string `json:"session_id"`
}

type GetFileReadParams struct {
	SessionID string `json:"session_id"`
	Path      string `json:"path"`
}

type RecordFileReadParams struct {
	SessionID string `json:"session_id"`
	Path      string `json:"path"`
}

type UpdateMessageParams struct {
	ID         string         `json:"id"`
	Parts      string         `json:"parts"`
	Model      sql.NullString `json:"model"`
	FinishedAt sql.NullInt64  `json:"finished_at"`
	Provider   sql.NullString `json:"provider"`
	TokenCount sql.NullInt64  `json:"token_count"`
}

type UpdateSessionParams struct {
	ID               string         `json:"id"`
	Title            string         `json:"title"`
	MessageCount     int64          `json:"message_count"`
	PromptTokens     int64          `json:"prompt_tokens"`
	CompletionTokens int64          `json:"completion_tokens"`
	Cost             float64        `json:"cost"`
	SummaryMessageID sql.NullString `json:"summary_message_id"`
	Todos            sql.NullString `json:"todos"`
}

type UpdateSessionTitleAndUsageParams struct {
	ID               string  `json:"id"`
	Title            string  `json:"title"`
	MessageCount     int64   `json:"message_count"`
	PromptTokens     int64   `json:"prompt_tokens"`
	CompletionTokens int64   `json:"completion_tokens"`
	Cost             float64 `json:"cost"`
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

type GetHourDayHeatmapRow struct {
	Hour  int64 `json:"hour"`
	Day   int64 `json:"day"`
	Count int64 `json:"count"`
}

type GetRecentActivityRow struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type GetToolUsageRow struct {
	ToolName string `json:"tool_name"`
	Count    int64  `json:"count"`
}

type GetTotalStatsRow struct {
	TotalSessions int64   `json:"total_sessions"`
	TotalMessages int64   `json:"total_messages"`
	TotalCost     float64 `json:"total_cost"`
	TotalTokens   int64   `json:"total_tokens"`
}

type GetUsageByDayRow struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type GetUsageByDayOfWeekRow struct {
	DayOfWeek int64 `json:"day_of_week"`
	Count     int64 `json:"count"`
}

type GetUsageByHourRow struct {
	Hour  int64 `json:"hour"`
	Count int64 `json:"count"`
}

type GetUsageByModelRow struct {
	Model string `json:"model"`
	Count int64  `json:"count"`
}

// ---------------------------------------------------------------------------
// Stub method implementations on *Queries
// ---------------------------------------------------------------------------

func (q *Queries) CreateFile(ctx context.Context, arg CreateFileParams) (File, error) {
	return File{}, nil
}

func (q *Queries) CreateMessage(ctx context.Context, arg CreateMessageParams) (Message, error) {
	return Message{}, nil
}

func (q *Queries) CreateSession(ctx context.Context, arg CreateSessionParams) (Session, error) {
	return Session{}, nil
}

func (q *Queries) DeleteFile(ctx context.Context, id string) error {
	return nil
}

func (q *Queries) DeleteMessage(ctx context.Context, id string) error {
	return nil
}

func (q *Queries) DeleteSession(ctx context.Context, id string) error {
	return nil
}

func (q *Queries) DeleteSessionFiles(ctx context.Context, sessionID string) error {
	return nil
}

func (q *Queries) DeleteSessionMessages(ctx context.Context, sessionID string) error {
	return nil
}

func (q *Queries) GetAverageResponseTime(ctx context.Context) (int64, error) {
	return 0, nil
}

func (q *Queries) GetFile(ctx context.Context, id string) (File, error) {
	return File{}, nil
}

func (q *Queries) GetFileByPathAndSession(ctx context.Context, arg GetFileByPathAndSessionParams) (File, error) {
	return File{}, nil
}

func (q *Queries) GetFileRead(ctx context.Context, arg GetFileReadParams) (ReadFile, error) {
	return ReadFile{}, nil
}

func (q *Queries) GetHourDayHeatmap(ctx context.Context) ([]GetHourDayHeatmapRow, error) {
	return nil, nil
}

func (q *Queries) GetMessage(ctx context.Context, id string) (Message, error) {
	return Message{}, nil
}

func (q *Queries) GetRecentActivity(ctx context.Context) ([]GetRecentActivityRow, error) {
	return nil, nil
}

func (q *Queries) GetSessionByID(ctx context.Context, id string) (Session, error) {
	return Session{}, nil
}

func (q *Queries) GetToolUsage(ctx context.Context) ([]GetToolUsageRow, error) {
	return nil, nil
}

func (q *Queries) GetTotalStats(ctx context.Context) (GetTotalStatsRow, error) {
	return GetTotalStatsRow{}, nil
}

func (q *Queries) GetUsageByDay(ctx context.Context) ([]GetUsageByDayRow, error) {
	return nil, nil
}

func (q *Queries) GetUsageByDayOfWeek(ctx context.Context) ([]GetUsageByDayOfWeekRow, error) {
	return nil, nil
}

func (q *Queries) GetUsageByHour(ctx context.Context) ([]GetUsageByHourRow, error) {
	return nil, nil
}

func (q *Queries) GetUsageByModel(ctx context.Context) ([]GetUsageByModelRow, error) {
	return nil, nil
}

func (q *Queries) ListAllUserMessages(ctx context.Context) ([]Message, error) {
	return nil, nil
}

func (q *Queries) ListFilesByPath(ctx context.Context, path string) ([]File, error) {
	return nil, nil
}

func (q *Queries) ListFilesBySession(ctx context.Context, sessionID string) ([]File, error) {
	return nil, nil
}

func (q *Queries) ListLatestSessionFiles(ctx context.Context, sessionID string) ([]File, error) {
	return nil, nil
}

func (q *Queries) ListMessagesBySession(ctx context.Context, sessionID string) ([]Message, error) {
	return nil, nil
}

func (q *Queries) ListNewFiles(ctx context.Context) ([]File, error) {
	return nil, nil
}

func (q *Queries) ListSessionReadFiles(ctx context.Context, sessionID string) ([]ReadFile, error) {
	return nil, nil
}

func (q *Queries) ListSessions(ctx context.Context) ([]Session, error) {
	return nil, nil
}

func (q *Queries) ListUserMessagesBySession(ctx context.Context, sessionID string) ([]Message, error) {
	return nil, nil
}

func (q *Queries) RecordFileRead(ctx context.Context, arg RecordFileReadParams) error {
	return nil
}

func (q *Queries) UpdateMessage(ctx context.Context, arg UpdateMessageParams) error {
	return nil
}

func (q *Queries) UpdateSession(ctx context.Context, arg UpdateSessionParams) (Session, error) {
	return Session{}, nil
}

func (q *Queries) UpdateSessionTitleAndUsage(ctx context.Context, arg UpdateSessionTitleAndUsageParams) error {
	return nil
}
