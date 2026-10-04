package tracker

import (
	"context"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

func (s *Scope) Inbox(ctx context.Context) ([]storage.InboxUpdate, error) {
	return s.svc.store.Inbox(ctx, s.actor.WorkspaceID, s.actor.UserID)
}

type InboxDismissInput struct {
	IssueID  string
	Revision string
}

func (s *Scope) DismissInbox(ctx context.Context, input []InboxDismissInput) error {
	updates := make([]storage.InboxDismissal, len(input))
	for i, update := range input {
		revision, err := time.Parse(time.RFC3339Nano, update.Revision)
		if err != nil || !isUUID(update.IssueID) {
			return invalid("invalid inbox update")
		}
		updates[i] = storage.InboxDismissal{IssueID: update.IssueID, UpdatedThrough: revision}
	}
	return notFound(s.svc.store.DismissInbox(ctx, s.actor.WorkspaceID, s.actor.UserID, updates), "Inbox update")
}
