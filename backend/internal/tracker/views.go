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

func (s *Scope) CreateView(ctx context.Context, view storage.SavedView) (storage.SavedView, error) {
	view.Name = strings.TrimSpace(view.Name)
	catalog, err := s.viewCatalog(ctx)
	if err != nil {
		return storage.SavedView{}, err
	}
	if err := catalog.check(&view); err != nil {
		return storage.SavedView{}, err
	}
	view.WorkspaceID = s.actor.WorkspaceID
	view.ID = shortuuid.New()
	if view.LabelIDs == nil {
		view.LabelIDs = []string{}
	}
	return s.svc.store.CreateSavedView(ctx, view)
}

type SavedViewUpdateInput struct {
	Name            *string
	TeamID          Optional[string]
	LabelIDs        []string
	Layout          *string
	Grouping        *string
	Ordering        *string
	CompletedFilter *string
	ShowEmpty       *bool
	DueDateFilter   *string
}

func (s *Scope) UpdateView(ctx context.Context, id string, in SavedViewUpdateInput) (storage.SavedView, error) {
	catalog, err := s.viewCatalog(ctx)
	if err != nil {
		return storage.SavedView{}, err
	}
	updated, err := s.svc.store.UpdateSavedView(ctx, s.actor.WorkspaceID, id, func(view storage.SavedView) (storage.SavedView, error) {
		if in.Name != nil {
			view.Name = strings.TrimSpace(*in.Name)
		}
		in.TeamID.apply(&view.TeamID)
		if in.LabelIDs != nil {
			view.LabelIDs = in.LabelIDs
		}
		if in.Layout != nil {
			view.Layout = *in.Layout
		}
		if in.Grouping != nil {
			view.Grouping = *in.Grouping
		}
		if in.Ordering != nil {
			view.Ordering = *in.Ordering
		}
		if in.CompletedFilter != nil {
			view.CompletedFilter = *in.CompletedFilter
		}
		if in.DueDateFilter != nil {
			view.DueDateFilter = *in.DueDateFilter
		}
		if in.ShowEmpty != nil {
			view.ShowEmpty = *in.ShowEmpty
		}
		err := catalog.check(&view)
		return view, err
	})
	return updated, notFound(err, "SavedView")
}

type viewCatalog struct {
	teams  []storage.Team
	labels []storage.IssueLabel
}

func (s *Scope) viewCatalog(ctx context.Context) (viewCatalog, error) {
	teams, err := s.Teams(ctx)
	if err != nil {
		return viewCatalog{}, err
	}
	labels, err := s.IssueLabels(ctx)
	return viewCatalog{teams: teams, labels: labels}, err
}

func (c viewCatalog) check(view *storage.SavedView) error {
	if view.Name == "" || !slices.Contains([]string{"list", "board"}, view.Layout) ||
		!slices.Contains([]string{"state", "label"}, view.Grouping) ||
		!slices.Contains([]string{"manual", "priority", "updated", "created"}, view.Ordering) ||
		!slices.Contains([]string{"hidden", "week", "7d", "30d", "all"}, view.CompletedFilter) ||
		!slices.Contains([]string{"any", "week"}, view.DueDateFilter) {
		return invalid("view requires a name and valid display settings")
	}
	if view.TeamID != nil {
		team, err := find(c.teams, nil, "Team", func(team storage.Team) bool {
			return team.ID == *view.TeamID || strings.EqualFold(team.Key, *view.TeamID)
		})
		if err != nil {
			return err
		}
		view.TeamID = &team.ID
	}
	for _, id := range view.LabelIDs {
		label, err := find(c.labels, nil, "IssueLabel", func(label storage.IssueLabel) bool { return label.ID == id })
		if err != nil {
			return err
		}
		if label.IsGroup || (view.TeamID != nil && label.TeamID != nil && *view.TeamID != *label.TeamID) {
			return invalid("label does not belong to this view's team")
		}
	}
	return nil
}

func (s *Scope) DeleteView(ctx context.Context, id string) error {
	return notFound(s.svc.store.DeleteSavedView(ctx, s.actor.WorkspaceID, id), "SavedView")
}
