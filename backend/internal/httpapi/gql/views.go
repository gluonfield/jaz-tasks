package gql

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

func (queryResolver) SavedViews(ctx context.Context) ([]storage.SavedView, error) {
	return scope(ctx).SavedViews(ctx)
}

func (mutationResolver) SavedViewCreate(ctx context.Context, input storage.SavedView) (*storage.SavedView, error) {
	return ref(scope(ctx).SaveView(ctx, "", input))
}

func (mutationResolver) SavedViewUpdate(ctx context.Context, id string, input storage.SavedView) (*storage.SavedView, error) {
	return ref(scope(ctx).SaveView(ctx, id, input))
}

func (mutationResolver) SavedViewDelete(ctx context.Context, id string) (*DeletePayload, error) {
	return deletePayload(id, scope(ctx).DeleteView(ctx, id))
}
