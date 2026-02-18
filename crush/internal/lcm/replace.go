package lcm

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
)

// ReplacePositionsWithSummary replaces context items at given positions with
// a single summary entry, using a delete-all/rebuild pattern within a transaction.
func ReplacePositionsWithSummary(
	ctx context.Context,
	db *sql.DB,
	sessionID string,
	positions []int,
	summaryID string,
) error {
	if len(positions) == 0 {
		return nil
	}

	// Note: This uses a DEFERRED transaction. The write lock is acquired on the
	// first write (DELETE below). In the single-process CLI context, this is safe.
	// If concurrent writers are ever needed, consider _txlock=immediate in the DSN.
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	insertPos := positions[0]
	for _, p := range positions[1:] {
		if p < insertPos {
			insertPos = p
		}
	}

	posSet := make(map[int]bool, len(positions))
	for _, p := range positions {
		posSet[p] = true
	}

	rows, err := tx.QueryContext(ctx,
		`SELECT position, item_type, message_id, summary_id
         FROM lcm_context_items
         WHERE session_id = ?
         ORDER BY position`, sessionID)
	if err != nil {
		return err
	}

	type item struct {
		Position  int
		ItemType  string
		MessageID sql.NullString
		SummaryID sql.NullString
	}

	var items []item
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.Position, &it.ItemType, &it.MessageID, &it.SummaryID); err != nil {
			rows.Close()
			return err
		}
		items = append(items, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM lcm_context_items WHERE session_id = ?`, sessionID); err != nil {
		return err
	}

	var newItems []item
	summaryInserted := false
	for _, it := range items {
		if posSet[it.Position] {
			if !summaryInserted {
				newItems = append(newItems, item{
					Position:  insertPos,
					ItemType:  "summary",
					SummaryID: sql.NullString{String: summaryID, Valid: true},
				})
				summaryInserted = true
			}
			continue
		}
		if !summaryInserted && it.Position > insertPos {
			newItems = append(newItems, item{
				Position:  insertPos,
				ItemType:  "summary",
				SummaryID: sql.NullString{String: summaryID, Valid: true},
			})
			summaryInserted = true
		}
		newItems = append(newItems, it)
	}
	if !summaryInserted {
		newItems = append(newItems, item{
			Position:  insertPos,
			ItemType:  "summary",
			SummaryID: sql.NullString{String: summaryID, Valid: true},
		})
	}

	sort.Slice(newItems, func(i, j int) bool {
		return newItems[i].Position < newItems[j].Position
	})

	for i, it := range newItems {
		var msgID, sumID interface{}
		if it.MessageID.Valid {
			msgID = it.MessageID.String
		}
		if it.SummaryID.Valid {
			sumID = it.SummaryID.String
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO lcm_context_items (session_id, position, item_type, message_id, summary_id)
             VALUES (?, ?, ?, ?, ?)`,
			sessionID, i, it.ItemType, msgID, sumID); err != nil {
			return fmt.Errorf("failed to insert context item at position %d: %w", i, err)
		}
	}

	return tx.Commit()
}
