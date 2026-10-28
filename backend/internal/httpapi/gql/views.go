package gql

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

func (queryResolver) SavedViews(ctx context.Context) ([]storage.SavedView, error) {
	return scope(ctx).SavedViews(ctx)
}

func (mutationResolver) SavedViewCreate(ctx context.Context, input storage.SavedView) (*storage.SavedView, error) {
	return ref(scope(ctx).CreateView(ctx, input))
}

func (mutationResolver) SavedViewUpdate(ctx context.Context, id string, input SavedViewUpdateInput) (*storage.SavedView, error) {
	return ref(scope(ctx).UpdateView(ctx, id, tracker.SavedViewUpdateInput{
		Name: input.Name.Value(), TeamID: omittable(input.TeamID), LabelIDs: input.LabelIds.Value(),
		Layout: input.Layout.Value(), Grouping: input.Grouping.Value(), Ordering: input.Ordering.Value(),
		CompletedFilter: input.CompletedFilter.Value(), ShowEmpty: input.ShowEmpty.Value(), DueDateFilter: input.DueDateFilter.Value(),
	}))
}

func (mutationResolver) SavedViewDelete(ctx context.Context, id string) (*DeletePayload, error) {
	return deletePayload(id, scope(ctx).DeleteView(ctx, id))
}
