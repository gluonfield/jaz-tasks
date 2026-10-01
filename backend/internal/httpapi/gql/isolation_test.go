package gql_test

import (
	"context"
	"strings"
	"testing"

	"github.com/gluonfield/jaz-tasks/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
)

// tenant B signs up into its own workspace with an ENG team and ENG-1, so
// identifiers collide with the demo workspace A.
func tenantB(t *testing.T, store *postgres.Store) (string, storage.Issue) {
	t.Helper()
	ctx := context.Background()
	user, err := workspaces.NewService(store, workspaces.Config{}).SignIn(ctx, signin.Identity{
		Issuer: "https://idp.test", Subject: "bob", Email: "bob@b.test", EmailVerified: true, Name: "Bob Stone",
	})
	if err != nil {
		t.Fatal(err)
	}
	s := tracker.NewService(store, "http://tasks.test").Scope(auth.Actor{UserID: user.ID, WorkspaceID: user.WorkspaceID})
	team, err := s.CreateTeam(ctx, tracker.TeamCreateInput{Name: "Bob Engineering", Key: ptr("ENG")})
	if err != nil {
		t.Fatal(err)
	}
	issue, err := s.CreateIssue(ctx, tracker.IssueCreateInput{TeamID: team.ID, Title: ptr("Bob's private roadmap")})
	if err != nil {
		t.Fatal(err)
	}
	key, _, err := auth.NewService(store, auth.Config{PublicURL: "http://tasks.test"}).CreateKey(ctx, user.ID, "bob", "")
	if err != nil {
		t.Fatal(err)
	}
	return key, issue
}

func ptr[T any](v T) *T {
	return &v
}

// A's references, read with A's own key.
type refsA struct {
	issue, identifier, team, state, user, label, project, slug, cycle, comment string
}

func readA(t *testing.T, c *client) refsA {
	t.Helper()
	_, out := c.do(`{
		issue(id: "ENG-1") { id identifier team { id } state { id } assignee { id } labels { nodes { id } } project { id slugId } cycle { id } comments { nodes { id } } }
	}`, c.key)
	if len(out.Errors) > 0 {
		t.Fatal(out.Errors)
	}
	s := func(path string) string { return get(out.Data, path).(string) }
	return refsA{
		issue: s("issue.id"), identifier: s("issue.identifier"), team: s("issue.team.id"), state: s("issue.state.id"),
		user: s("issue.assignee.id"), label: s("issue.labels.nodes.0.id"), project: s("issue.project.id"),
		slug: s("issue.project.slugId"), cycle: s("issue.cycle.id"), comment: s("issue.comments.nodes.0.id"),
	}
}

func TestTenantIsolationGraphQL(t *testing.T) {
	c := newClient(t)
	a := readA(t, c)
	_, out := c.do(`mutation { organizationInviteCreate(input: { email: "pat@a.test" }) { organizationInvite { id } } }`, c.key)
	invite, _ := get(out.Data, "organizationInviteCreate.organizationInvite.id").(string)
	keyB, issueB := tenantB(t, c.store)
	r := strings.NewReplacer(
		"$ISSUE", a.issue, "$TEAM", a.team, "$STATE", a.state, "$USER", a.user, "$LABEL", a.label,
		"$PROJECT", a.project, "$SLUG", a.slug, "$CYCLE", a.cycle, "$COMMENT", a.comment, "$MINE", issueB.ID,
		"$INVITE", invite,
	)
	attacks := []string{
		`{ issue(id: "$ISSUE") { id } }`,
		`{ team(id: "$TEAM") { id } }`,
		`{ workflowState(id: "$STATE") { id } }`,
		`{ user(id: "$USER") { id } }`,
		`{ issueLabel(id: "$LABEL") { id } }`,
		`{ project(id: "$PROJECT") { id } }`,
		`{ project(id: "$SLUG") { id } }`,
		`{ cycle(id: "$CYCLE") { id } }`,
		`{ comment(id: "$COMMENT") { id } }`,
		`mutation { issueUpdate(id: "$ISSUE", input: { title: "owned" }) { success } }`,
		`mutation { issueArchive(id: "$ISSUE") { success } }`,
		`mutation { issueDelete(id: "$ISSUE", permanentlyDelete: true) { success } }`,
		`mutation { issueAddLabel(id: "$ISSUE", labelId: "$LABEL") { success } }`,
		`mutation { issueCreate(input: { teamId: "$TEAM", title: "x" }) { success } }`,
		`mutation { issueBatchCreate(input: { issues: [{ teamId: "$TEAM", title: "x" }] }) { success } }`,
		`mutation { issueUpdate(id: "$MINE", input: { assigneeId: "$USER" }) { success } }`,
		`mutation { issueUpdate(id: "$MINE", input: { labelIds: ["$LABEL"] }) { success } }`,
		`mutation { issueUpdate(id: "$MINE", input: { projectId: "$PROJECT" }) { success } }`,
		`mutation { issueUpdate(id: "$MINE", input: { cycleId: "$CYCLE" }) { success } }`,
		`mutation { issueUpdate(id: "$MINE", input: { parentId: "$ISSUE" }) { success } }`,
		`mutation { issueUpdate(id: "$MINE", input: { stateId: "$STATE" }) { success } }`,
		`mutation { issueUpdate(id: "$MINE", input: { teamId: "$TEAM" }) { success } }`,
		`mutation { issueAddLabel(id: "$MINE", labelId: "$LABEL") { success } }`,
		`mutation { commentCreate(input: { issueId: "$ISSUE", body: "hi" }) { success } }`,
		`mutation { commentCreate(input: { issueId: "$MINE", body: "hi", parentId: "$COMMENT" }) { success } }`,
		`mutation { commentUpdate(id: "$COMMENT", input: { body: "owned" }) { success } }`,
		`mutation { commentDelete(id: "$COMMENT") { success } }`,
		`mutation { issueLabelUpdate(id: "$LABEL", input: { name: "owned" }) { success } }`,
		`mutation { issueLabelDelete(id: "$LABEL") { success } }`,
		`mutation { issueLabelCreate(input: { name: "x", teamId: "$TEAM" }) { success } }`,
		`mutation { projectUpdate(id: "$PROJECT", input: { name: "owned" }) { success } }`,
		`mutation { projectCreate(input: { name: "x", teamIds: ["$TEAM"] }) { success } }`,
		`mutation { projectCreate(input: { name: "x", teamIds: [], leadId: "$USER" }) { success } }`,
		`mutation { workflowStateCreate(input: { teamId: "$TEAM", name: "x", type: "started", color: "#fff" }) { success } }`,
		`mutation { cycleCreate(input: { teamId: "$TEAM", startsAt: "2030-01-01T00:00:00Z", endsAt: "2030-01-14T00:00:00Z" }) { success } }`,
		`mutation { teamUpdate(id: "$TEAM", input: { name: "owned" }) { success } }`,
		`mutation { organizationInviteDelete(id: "$INVITE") { success } }`,
	}
	for _, doc := range attacks {
		query := r.Replace(doc)
		_, out := c.do(query, keyB)
		if len(out.Errors) == 0 {
			t.Errorf("tenant B succeeded: %s -> %+v", query, out.Data)
		} else if out.Errors[0].Extensions["code"] != "INPUT_ERROR" {
			t.Errorf("%s failed for the wrong reason: %+v", query, out.Errors)
		}
	}

	_, out = c.do(`{
		issue(id: "ENG-1") { title }
		issues { nodes { id } }
		searchIssues(term: "Linear-compatible") { nodes { id } }
		teams { nodes { key } }
		users { nodes { email } }
		issueLabels { nodes { id } }
		projects { nodes { id } }
		cycles { nodes { id } }
		workflowStates { nodes { team { key } } }
		organization { name }
		organizationInvites { nodes { id } }
	}`, keyB)
	for path, want := range map[string]any{
		"issue.title":                 "Bob's private roadmap",
		"issues.nodes.#":              1.0,
		"searchIssues.nodes.#":        0.0,
		"users.nodes.#":               1.0,
		"users.nodes.0.email":         "bob@b.test",
		"issueLabels.nodes.#":         0.0,
		"projects.nodes.#":            0.0,
		"cycles.nodes.#":              0.0,
		"workflowStates.nodes.#":      12.0,
		"organization.name":           "Personal",
		"organizationInvites.nodes.#": 0.0,
	} {
		if got := get(out.Data, path); got != want {
			t.Errorf("tenant B sees %s = %#v, want %#v", path, got, want)
		}
	}

	_, out = c.do(`{ issue(id: "`+a.issue+`") { title archivedAt labels { nodes { name } } comments { nodes { body } } project { name } team { name } } issueLabel(id: "`+a.label+`") { name } organizationInvites { nodes { id } } }`, c.key)
	if len(out.Errors) > 0 || get(out.Data, "issue.title") != "Linear-compatible GraphQL endpoint" || get(out.Data, "issue.archivedAt") != nil ||
		get(out.Data, "issue.comments.nodes.#") != 2.0 || get(out.Data, "issue.project.name") != "Tasks MVP" || get(out.Data, "issueLabel.name") != "Feature" ||
		get(out.Data, "issue.team.name") != "Engineering" || get(out.Data, "organizationInvites.nodes.#") != 1.0 {
		t.Fatalf("tenant A's data changed: %+v %+v", out.Data, out.Errors)
	}
}
