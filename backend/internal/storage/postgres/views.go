package postgres

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	db "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/tracker"
)

func (s *Store) SavedViews(ctx context.Context, workspaceID string) ([]storage.SavedView, error) {
	return many(func(row db.SavedView) storage.SavedView { return storage.SavedView(row) })(s.q.ListSavedViews(ctx, workspaceID))
}

func (s *Store) CreateSavedView(ctx context.Context, view storage.SavedView) (storage.SavedView, error) {
	return one(func(row db.SavedView) storage.SavedView { return storage.SavedView(row) })(s.q.CreateSavedView(ctx, db.CreateSavedViewParams(view)))
}

func (s *Store) UpdateSavedView(ctx context.Context, view storage.SavedView) (storage.SavedView, error) {
	return one(func(row db.SavedView) storage.SavedView { return storage.SavedView(row) })(s.q.UpdateSavedView(ctx, db.UpdateSavedViewParams{
		ID: view.ID, WorkspaceID: view.WorkspaceID, Name: view.Name, TeamID: view.TeamID, LabelIDs: view.LabelIDs,
		Layout: view.Layout, Grouping: view.Grouping, Ordering: view.Ordering, ShowCompleted: view.ShowCompleted, ShowEmpty: view.ShowEmpty,
	}))
}

func (s *Store) DeleteSavedView(ctx context.Context, workspaceID, id string) error {
	return affected(s.q.DeleteSavedView(ctx, db.DeleteSavedViewParams{WorkspaceID: workspaceID, ID: id}))
}
