package gql

import (
	"context"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

func (inboxUpdateResolver) Revision(_ context.Context, update *storage.InboxUpdate) (string, error) {
	return update.UpdatedAt.UTC().Format(time.RFC3339Nano), nil
}
