package tracker_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/seed"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

func seeded(t *testing.T) (*tracker.Scope, context.Context) {
	t.Helper()
	ctx := context.Background()
	store := postgrestest.New(t)
	svc := tracker.NewService(store, "http://tasks.test")
	result, ok, err := seed.Run(ctx, store, auth.NewService(store, auth.Config{PublicURL: "http://tasks.test"}), svc, "")
	if err != nil || !ok {
		t.Fatalf("seed: ok=%v err=%v", ok, err)
	}
	return svc.Scope(result.Actor), ctx
}

func issueByTitle(t *testing.T, s *tracker.Scope, ctx context.Context, title string) storage.Issue {
	t.Helper()
	page, err := s.Issues(ctx, tracker.IssueQuery{Search: title})
	if err != nil || len(page.Nodes) != 1 {
		t.Fatalf("issue %q: %d matches, err %v", title, len(page.Nodes), err)
	}
	return page.Nodes[0]
}

func TestIssueFiltersResolveLinearShapes(t *testing.T) {
	s, ctx := seeded(t)
	eq := func(v string) *tracker.StringComparator { return &tracker.StringComparator{Eq: &v} }
	yes := true
	cases := []struct {
		name   string
		filter tracker.IssueFilter
		want   int
	}{
		{"team key", tracker.IssueFilter{Team: &tracker.TeamFilter{Key: eq("DES")}}, 5},
		{"state name in team", tracker.IssueFilter{State: &tracker.WorkflowStateFilter{Name: eq("In Review")}, Team: &tracker.TeamFilter{Key: eq("ENG")}}, 1},
		{"viewer", tracker.IssueFilter{Assignee: &tracker.UserFilter{IsMe: &tracker.BooleanComparator{Eq: &yes}}}, 2},
		{"unassigned", tracker.IssueFilter{Assignee: &tracker.UserFilter{Null: &yes}}, 7},
		{"label", tracker.IssueFilter{Labels: &tracker.IssueLabelFilter{Name: eq("Bug")}}, 2},
		{"urgent", tracker.IssueFilter{Priority: &tracker.NumberComparator{Eq: ptr(1.0)}}, 3},
		{"project lead", tracker.IssueFilter{Project: &tracker.ProjectFilter{Lead: &tracker.UserFilter{DisplayName: eq("kai")}}}, 4},
	}
	for _, tc := range cases {
		page, err := s.Issues(ctx, tracker.IssueQuery{Filter: &tc.filter})
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if len(page.Nodes) != tc.want {
			t.Errorf("%s: got %d issues, want %d", tc.name, len(page.Nodes), tc.want)
		}
	}
}

func TestIssueLookupByIdentifierAndPaging(t *testing.T) {
	s, ctx := seeded(t)
	issue, err := s.Issue(ctx, "eng-1")
	if err != nil || issue.Title != "Linear-compatible GraphQL endpoint" {
		t.Fatalf("ENG-1 = %q, %v", issue.Title, err)
	}
	if _, err := s.Issue(ctx, "ENG-999"); !errors.As(err, new(tracker.NotFoundError)) {
		t.Fatalf("missing issue error = %v", err)
	}
	first := int32(10)
	page, err := s.Issues(ctx, tracker.IssueQuery{PageArgs: tracker.PageArgs{First: &first}})
	if err != nil || len(page.Nodes) != 10 || !page.PageInfo.HasNextPage {
		t.Fatalf("first page: %d nodes, next=%v, err=%v", len(page.Nodes), page.PageInfo.HasNextPage, err)
	}
	rest, err := s.Issues(ctx, tracker.IssueQuery{PageArgs: tracker.PageArgs{First: ptr(int32(50)), After: page.PageInfo.EndCursor}})
	if err != nil || len(rest.Nodes) != 15 || rest.PageInfo.HasNextPage || rest.Nodes[0].ID == page.Nodes[9].ID {
		t.Fatalf("second page: %d nodes, next=%v, err=%v", len(rest.Nodes), rest.PageInfo.HasNextPage, err)
	}
}

func TestUpdateStampsLifecycleAndRecordsHistory(t *testing.T) {
	s, ctx := seeded(t)
	issue := issueByTitle(t, s, ctx, "Command palette")
	states, _ := s.TeamStates(ctx, issue.TeamID)
	done := states[4]
	updated, err := s.UpdateIssue(ctx, issue.ID, tracker.IssueUpdateInput{
		StateID:    &done.ID,
		AssigneeID: tracker.Optional[string]{Set: true},
		Priority:   tracker.Optional[int32]{Set: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.CompletedAt == nil || updated.StartedAt == nil || updated.AssigneeID != nil || updated.Priority != 0 {
		t.Fatalf("updated = %+v", updated)
	}
	history, err := s.IssueHistory(ctx, issue.ID)
	if err != nil {
		t.Fatal(err)
	}
	last := history[len(history)-1]
	if deref(last.ToStateID) != done.ID || last.FromAssigneeID == nil || last.ToAssigneeID != nil || deref(last.ToPriority) != 0 {
		t.Fatalf("history = %+v", last)
	}
	if _, err := s.UpdateIssue(ctx, issue.ID, tracker.IssueUpdateInput{SortOrder: ptr(99.0)}); err != nil {
		t.Fatal(err)
	}
	if again, _ := s.IssueHistory(ctx, issue.ID); len(again) != len(history) {
		t.Fatalf("sort order change recorded history")
	}
}

func TestMoveTeamRenumbersAndMapsState(t *testing.T) {
	s, ctx := seeded(t)
	issue := issueByTitle(t, s, ctx, "Board view with drag and drop")
	moved, err := s.UpdateIssue(ctx, issue.ID, tracker.IssueUpdateInput{TeamID: ptr("DES")})
	if err != nil {
		t.Fatal(err)
	}
	identifier, _ := s.Identifier(ctx, moved)
	state, _ := s.WorkflowState(ctx, moved.StateID)
	if identifier != "DES-6" || state.Type != "started" || moved.CycleID != nil {
		t.Fatalf("moved = %s state %s cycle %v", identifier, state.Name, moved.CycleID)
	}
}

func TestUpdateRejectsInvalidReferences(t *testing.T) {
	s, ctx := seeded(t)
	parent := issueByTitle(t, s, ctx, "MCP server for agents")
	child := issueByTitle(t, s, ctx, "List and search tools")
	labels, _ := s.FindIssueLabels(ctx, &tracker.IssueLabelFilter{Name: &tracker.StringComparator{Eq: ptr("Polish")}}, false)
	for name, in := range map[string]tracker.IssueUpdateInput{
		"ancestor loop":    {ParentID: tracker.Optional[string]{Set: true, Value: &child.ID}},
		"other team label": {AddedLabelIDs: []string{labels[0].ID}},
		"other team state": {StateID: ptr(mustState(t, s, ctx, "DES"))},
		"priority range":   {Priority: tracker.Optional[int32]{Set: true, Value: ptr(int32(7))}},
		"unknown assignee": {AssigneeID: tracker.Optional[string]{Set: true, Value: ptr("00000000-0000-0000-0000-000000000000")}},
	} {
		if _, err := s.UpdateIssue(ctx, parent.ID, in); err == nil {
			t.Errorf("%s: update succeeded", name)
		}
	}
}

func mustState(t *testing.T, s *tracker.Scope, ctx context.Context, team string) string {
	t.Helper()
	found, err := s.Team(ctx, team)
	if err != nil {
		t.Fatal(err)
	}
	states, _ := s.TeamStates(ctx, found.ID)
	return states[0].ID
}

func ptr[T any](v T) *T {
	return &v
}

func deref[T any](v *T) T {
	var zero T
	if v == nil {
		return zero
	}
	return *v
}
