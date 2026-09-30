package mcpapi

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

// Tools accept names; these resolve them case-insensitively to ids.

const none = "none"

func resolveTeam(ctx context.Context, s *tracker.Scope, ref string) (storage.Team, error) {
	if team, err := s.Team(ctx, ref); err == nil {
		return team, nil
	}
	teams, err := s.Teams(ctx)
	return pick(teams, err, "team", ref, func(t storage.Team) []string { return []string{t.Name} })
}

func resolveUser(ctx context.Context, s *tracker.Scope, ref string) (storage.User, error) {
	if strings.EqualFold(ref, "me") {
		return s.Viewer(ctx)
	}
	users, err := s.Users(ctx)
	return pick(users, err, "user", ref, func(u storage.User) []string { return []string{u.ID, u.Name, u.DisplayName, u.Email} })
}

func resolveProject(ctx context.Context, s *tracker.Scope, ref string) (storage.Project, error) {
	projects, err := s.Projects(ctx)
	return pick(projects, err, "project", ref, func(p storage.Project) []string { return []string{p.ID, p.SlugID, p.Name} })
}

func resolveTeams(ctx context.Context, s *tracker.Scope, refs []string) ([]string, error) {
	ids := []string{}
	for _, ref := range refs {
		team, err := resolveTeam(ctx, s, ref)
		if err != nil {
			return nil, err
		}
		ids = append(ids, team.ID)
	}
	return ids, nil
}

func resolveProjectStatus(ref string) (tracker.ProjectStatus, error) {
	return pick(tracker.ProjectStatuses, nil, "project status", ref, func(st tracker.ProjectStatus) []string { return []string{st.ID, st.Name} })
}

func resolveState(ctx context.Context, s *tracker.Scope, teamID, ref string) (storage.WorkflowState, error) {
	states, err := s.TeamStates(ctx, teamID)
	return pick(states, err, "state", ref, func(st storage.WorkflowState) []string { return []string{st.ID, st.Name} })
}

func resolveLabels(ctx context.Context, s *tracker.Scope, refs []string) ([]string, error) {
	labels, err := s.IssueLabels(ctx)
	ids := []string{}
	for _, ref := range refs {
		label, err := pick(labels, err, "label", ref, func(l storage.IssueLabel) []string { return []string{l.ID, l.Name} })
		if err != nil {
			return nil, err
		}
		ids = append(ids, label.ID)
	}
	return ids, err
}

func resolveDate(ref string) (*time.Time, error) {
	date, err := time.Parse(dateLayout, ref)
	if err != nil {
		return nil, fmt.Errorf("dates use YYYY-MM-DD, got %q", ref)
	}
	return &date, nil
}

func pick[T any](items []T, err error, kind, ref string, names func(T) []string) (T, error) {
	var zero T
	if err != nil {
		return zero, err
	}
	for _, item := range items {
		if slices.ContainsFunc(names(item), func(name string) bool { return strings.EqualFold(name, ref) }) {
			return item, nil
		}
	}
	return zero, fmt.Errorf("no %s named %q", kind, ref)
}
