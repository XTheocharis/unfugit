package lcm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

// AgenticMapManager manages agentic map operations.
type AgenticMapManager struct {
	store Store
}

// MapRunConfig holds configuration for creating a new agentic map run.
type MapRunConfig struct {
	InputPath      string
	Prompt         string
	OutputSchema   string
	ReadOnly       bool
	Concurrency    int
	TimeoutSeconds int
	MaxAttempts    int
}

// NewAgenticMapManager creates a new AgenticMapManager.
func NewAgenticMapManager(store Store) *AgenticMapManager {
	return &AgenticMapManager{store: store}
}

// CreateRun creates a new agentic map run and returns its map ID.
func (m *AgenticMapManager) CreateRun(ctx context.Context, config MapRunConfig) (string, error) {
	mapID := generateMapID("agentic", config.Prompt)
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
	run := &AgenticMapRun{
		MapID:          mapID,
		RunStartedAt:   time.Now().Unix(),
		Status:         "PENDING",
		InputPath:      config.InputPath,
		Prompt:         config.Prompt,
		OutputSchema:   config.OutputSchema,
		ReadOnly:       config.ReadOnly,
		Concurrency:    concurrency,
		TimeoutSeconds: timeout,
		MaxAttempts:    maxAttempts,
	}
	if err := m.store.CreateAgenticMapRun(ctx, run); err != nil {
		return "", fmt.Errorf("failed to create agentic map run: %w", err)
	}
	return mapID, nil
}

// GetRun retrieves the status of an agentic map run.
func (m *AgenticMapManager) GetRun(ctx context.Context, mapID string) (*AgenticMapRun, error) {
	return m.store.GetAgenticMapRun(ctx, mapID)
}

// ProcessItems processes pending items in the agentic map run.
func (m *AgenticMapManager) ProcessItems(ctx context.Context, mapID string) error {
	items, err := m.store.GetAgenticMapItemsByStatus(ctx, mapID, "PENDING")
	if err != nil {
		return fmt.Errorf("failed to get pending items: %w", err)
	}
	for _, item := range items {
		item.Status = "RUNNING"
		item.StartedAt = time.Now().Unix()
		if err := m.store.UpdateAgenticMapItem(ctx, &item); err != nil {
			return fmt.Errorf("failed to update item status: %w", err)
		}
		// Items are processed by the caller (agent loop); mark as running.
		// The actual execution is delegated to the agent framework.
	}
	return nil
}

// GetResults retrieves all items (completed or otherwise) for a map run.
func (m *AgenticMapManager) GetResults(ctx context.Context, mapID string) ([]AgenticMapItem, error) {
	// Get items in all statuses by querying each status
	var allItems []AgenticMapItem
	for _, status := range []string{"PENDING", "RUNNING", "COMPLETED", "FAILED"} {
		items, err := m.store.GetAgenticMapItemsByStatus(ctx, mapID, status)
		if err != nil {
			return nil, err
		}
		allItems = append(allItems, items...)
	}
	return allItems, nil
}

func generateMapID(prefix, seed string) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s|%s|%d", prefix, seed, time.Now().UnixNano())
	hash := hex.EncodeToString(h.Sum(nil))
	return "map_" + hash[:16]
}
