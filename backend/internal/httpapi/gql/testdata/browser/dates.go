package main

import (
	"context"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

func seedDateIssues(ctx context.Context, store storage.TrackerStore, scope *tracker.Scope) error {
	key := "DATE"
	team, err := scope.CreateTeam(ctx, tracker.TeamCreateInput{Name: "Date filters", Key: &key})
	if err != nil {
		return err
	}
	states, err := scope.WorkflowStates(ctx)
	if err != nil {
		return err
	}
	byType := map[string]string{}
	for _, state := range states {
		if state.TeamID == team.ID {
			byType[state.Type] = state.ID
		}
	}
	var issues []storage.NewIssue
	for _, item := range []struct{ title, state, finished, due string }{
		{"Open without date", "unstarted", "", ""},
		{"Due Monday", "unstarted", "", "2026-10-19"},
		{"Due Sunday", "unstarted", "", "2026-10-25"},
		{"Due next Monday", "unstarted", "", "2026-10-26"},
		{"Due previous Sunday", "unstarted", "", "2026-10-18"},
		{"Done Monday midnight", "completed", "2026-10-19T00:00:00+01:00", "2026-10-19"},
		{"Done previous Sunday", "completed", "2026-10-18T23:59:59+01:00", ""},
		{"Done Tuesday", "completed", "2026-10-20T12:00:00Z", ""},
		{"Done Sunday", "completed", "2026-10-25T23:59:59Z", "2026-10-25"},
		{"Done seven days ago", "completed", "2026-10-18T23:59:59.500Z", ""},
		{"Done before seven days", "completed", "2026-10-18T23:59:59.499Z", ""},
		{"Done this month", "completed", "2026-10-10T12:00:00Z", ""},
		{"Done long ago", "completed", "2026-09-01T12:00:00Z", "2026-10-25"},
		{"Done without timestamp", "completed", "", ""},
		{"Canceled Sunday", "canceled", "2026-10-25T23:59:59Z", ""},
		{"Reopened work", "unstarted", "2026-09-01T12:00:00Z", ""},
	} {
		issue := storage.NewIssue{WorkspaceID: team.WorkspaceID, TeamID: team.ID, StateID: byType[item.state], Title: item.title, LabelIDs: []string{}}
		if item.finished != "" {
			finished, err := time.Parse(time.RFC3339Nano, item.finished)
			if err != nil {
				return err
			}
			if item.state == "canceled" {
				issue.CanceledAt = &finished
			} else {
				issue.CompletedAt = &finished
			}
		}
		if item.due != "" {
			due, err := time.Parse(time.DateOnly, item.due)
			if err != nil {
				return err
			}
			issue.DueDate = &due
		}
		issues = append(issues, issue)
	}
	_, err = store.CreateIssues(ctx, issues)
	return err
}
