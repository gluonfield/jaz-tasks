package postgres

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	db "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/tracker"
)

func (s *Store) Inbox(ctx context.Context, workspaceID, userID string) ([]storage.InboxUpdate, error) {
	return many(func(row db.ListInboxRow) storage.InboxUpdate {
		return storage.InboxUpdate{Issue: toIssue(row.Issue), UpdatedAt: row.ActivityAt}
	})(s.q.ListInbox(ctx, db.ListInboxParams{WorkspaceID: workspaceID, UserID: userID}))
}

func (s *Store) DismissInbox(ctx context.Context, workspaceID, userID string, updates []storage.InboxDismissal) error {
	return s.tx(ctx, func(q *db.Queries) error {
		for _, update := range updates {
			if err := affected(q.DismissInboxUpdate(ctx, db.DismissInboxUpdateParams{
				WorkspaceID: workspaceID, UserID: userID, IssueID: update.IssueID, UpdatedThrough: update.UpdatedThrough,
			})); err != nil {
				return err
			}
		}
		return nil
	})
}
