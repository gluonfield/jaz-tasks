package tracker

import (
	"context"
	"slices"
	"strings"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/lithammer/shortuuid/v4"
)

func (s *Scope) SavedViews(ctx context.Context) ([]storage.SavedView, error) {
	return s.svc.store.SavedViews(ctx, s.actor.WorkspaceID)
}

func (s *Scope) SaveView(ctx context.Context, id string, view storage.SavedView) (storage.SavedView, error) {
	view.Name = strings.TrimSpace(view.Name)
	if view.Name == "" || !slices.Contains([]string{"list", "board"}, view.Layout) ||
		!slices.Contains([]string{"state", "label"}, view.Grouping) ||
		!slices.Contains([]string{"manual", "priority", "updated", "created"}, view.Ordering) {
		return storage.SavedView{}, invalid("view requires a name and valid display settings")
	}
	if view.TeamID != nil {
		team, err := s.Team(ctx, *view.TeamID)
		if err != nil {
			return storage.SavedView{}, err
		}
		view.TeamID = &team.ID
	}
	for _, id := range view.LabelIDs {
		label, err := s.IssueLabel(ctx, id)
		if err != nil {
			return storage.SavedView{}, err
		}
		if label.IsGroup || (view.TeamID != nil && label.TeamID != nil && *view.TeamID != *label.TeamID) {
			return storage.SavedView{}, invalid("label does not belong to this view's team")
		}
	}
	view.WorkspaceID = s.actor.WorkspaceID
	view.ID = id
	if view.LabelIDs == nil {
		view.LabelIDs = []string{}
	}
	if id == "" {
		view.ID = shortuuid.New()
		return s.svc.store.CreateSavedView(ctx, view)
	}
	updated, err := s.svc.store.UpdateSavedView(ctx, view)
	return updated, notFound(err, "SavedView")
}

func (s *Scope) DeleteView(ctx context.Context, id string) error {
	return notFound(s.svc.store.DeleteSavedView(ctx, s.actor.WorkspaceID, id), "SavedView")
}
