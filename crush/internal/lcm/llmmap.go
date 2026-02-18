package lcm

import (
	"context"
	"fmt"
	"time"
)

// LlmMapManager manages LLM-based map operations.
type LlmMapManager struct {
	store  Store
	client LLMClient
}

// LlmMapRunConfig holds configuration for creating a new LLM map run (E18).
type LlmMapRunConfig struct {
	InputPath      string
	Prompt         string
	OutputSchema   string
	Model          string
	Concurrency    int
	TimeoutSeconds int
	MaxAttempts    int
}

// NewLlmMapManager creates a new LlmMapManager.
func NewLlmMapManager(store Store, client LLMClient) *LlmMapManager {
	return &LlmMapManager{store: store, client: client}
}

// CreateRun creates a new LLM map run and returns its map ID.
func (m *LlmMapManager) CreateRun(ctx context.Context, config LlmMapRunConfig) (string, error) {
	mapID := generateMapID("llm", config.Prompt)
	concurrency := config.Concurrency
	if concurrency < 1 {
		concurrency = 1
	}
	timeout := config.TimeoutSeconds
	if timeout < 1 {
		timeout = 300
	}
	maxAttempts := config.MaxAttempts
	if maxAttempts < 1 {
		maxAttempts = 3
	}
	run := &LlmMapRun{
		MapID:          mapID,
		RunStartedAt:   time.Now().Unix(),
		Status:         "PENDING",
		InputPath:      config.InputPath,
		Prompt:         config.Prompt,
		OutputSchema:   config.OutputSchema,
		Model:          config.Model,
		Concurrency:    concurrency,
		TimeoutSeconds: timeout,
		MaxAttempts:    maxAttempts,
	}
	if err := m.store.CreateLlmMapRun(ctx, run); err != nil {
		return "", fmt.Errorf("failed to create LLM map run: %w", err)
	}
	return mapID, nil
}

// GetRun retrieves the status of an LLM map run.
func (m *LlmMapManager) GetRun(ctx context.Context, mapID string) (*LlmMapRun, error) {
	return m.store.GetLlmMapRun(ctx, mapID)
}

// ProcessItems processes pending items in the LLM map run using the LLM client.
func (m *LlmMapManager) ProcessItems(ctx context.Context, mapID string) error {
	run, err := m.store.GetLlmMapRun(ctx, mapID)
	if err != nil {
		return fmt.Errorf("failed to get LLM map run: %w", err)
	}
	items, err := m.store.GetLlmMapItemsByStatus(ctx, mapID, "PENDING")
	if err != nil {
		return fmt.Errorf("failed to get pending items: %w", err)
	}
	for i := range items {
		items[i].Status = "RUNNING"
		items[i].StartedAt = time.Now().Unix()
		if err := m.store.UpdateLlmMapItem(ctx, &items[i]); err != nil {
			return fmt.Errorf("failed to update item status: %w", err)
		}
		model := run.Model
		if run.ResolvedModel != "" {
			model = run.ResolvedModel
		}
		resp, err := m.client.Generate(ctx, LLMRequest{
			Model:  model,
			Prompt: fmt.Sprintf("%s\n\nInput:\n%s", run.Prompt, items[i].Item),
		})
		items[i].FinishedAt = time.Now().Unix()
		if err != nil {
			items[i].Status = "FAILED"
			items[i].Error = err.Error()
			items[i].AttemptsUsed++
		} else {
			items[i].Status = "COMPLETED"
			items[i].Result = resp.Text
			items[i].AttemptsUsed++
		}
		if err := m.store.UpdateLlmMapItem(ctx, &items[i]); err != nil {
			return fmt.Errorf("failed to update item result: %w", err)
		}
	}
	return nil
}

// GetResults retrieves all items for a map run.
func (m *LlmMapManager) GetResults(ctx context.Context, mapID string) ([]LlmMapItem, error) {
	var allItems []LlmMapItem
	for _, status := range []string{"PENDING", "RUNNING", "COMPLETED", "FAILED"} {
		items, err := m.store.GetLlmMapItemsByStatus(ctx, mapID, status)
		if err != nil {
			return nil, err
		}
		allItems = append(allItems, items...)
	}
	return allItems, nil
}
