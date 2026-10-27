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

func (s *Store) UpdateSavedView(ctx context.Context, workspaceID, id string, mutate storage.SavedViewMutation) (storage.SavedView, error) {
	var updated db.SavedView
	err := s.tx(ctx, func(q *db.Queries) error {
		locked, err := q.LockSavedView(ctx, db.LockSavedViewParams{WorkspaceID: workspaceID, ID: id})
		if err != nil {
			return err
		}
		view, err := mutate(storage.SavedView(locked))
		if err != nil {
			return err
		}
		updated, err = q.UpdateSavedView(ctx, db.UpdateSavedViewParams{
			ID: id, WorkspaceID: workspaceID, Name: view.Name, TeamID: view.TeamID, LabelIDs: view.LabelIDs,
			Layout: view.Layout, Grouping: view.Grouping, Ordering: view.Ordering, ShowCompleted: view.ShowCompleted, ShowEmpty: view.ShowEmpty,
		})
		return err
	})
	return one(func(row db.SavedView) storage.SavedView { return storage.SavedView(row) })(updated, err)
}

func (s *Store) DeleteSavedView(ctx context.Context, workspaceID, id string) error {
	return affected(s.q.DeleteSavedView(ctx, db.DeleteSavedViewParams{WorkspaceID: workspaceID, ID: id}))
}
