package lcm

import (
	"context"
	"log"
	"sync"
)

// CompactionManager coordinates async compaction, ensuring at most one
// compaction runs per session at a time.
type CompactionManager struct {
	inFlight sync.Map
	eventBus EventBus
}

// NewCompactionManager creates a new CompactionManager.
func NewCompactionManager(eventBus EventBus) *CompactionManager {
	return &CompactionManager{eventBus: eventBus}
}

// ScheduleCompaction runs compaction asynchronously.
// Returns nil for duplicate requests (compaction already in flight).
func (cm *CompactionManager) ScheduleCompaction(
	ctx context.Context,
	sessionID string,
	compactor *Compactor,
	budget TokenBudget,
) <-chan CompactionResult {
	resultChan := make(chan CompactionResult, 1)

	if _, loaded := cm.inFlight.LoadOrStore(sessionID, resultChan); loaded {
		log.Printf("Compaction already in flight for session %s", sessionID)
		close(resultChan)
		return nil
	}

	compactCtx := context.WithoutCancel(ctx)

	go func() {
		defer func() {
			cm.inFlight.Delete(sessionID)
			close(resultChan)
		}()

		rounds, err := compactor.CompactContext(compactCtx, sessionID, budget)
		finalTokens, _ := compactor.store.GetContextTokenCount(compactCtx, sessionID)
		result := CompactionResult{
			Success:     err == nil,
			Rounds:      rounds,
			FinalTokens: finalTokens,
			Error:       err,
		}

		if err != nil {
			log.Printf("Async compaction failed for session %s: %v", sessionID, err)
		}

		resultChan <- result

		if cm.eventBus != nil {
			cm.eventBus.Publish("compaction.complete", result)
		}
	}()

	return resultChan
}
