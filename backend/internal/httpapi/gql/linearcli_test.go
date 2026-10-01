package gql_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/charmbracelet/log"
	"github.com/gluonfield/jaz-tasks/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/authapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/gql"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/mcpapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/seed"
	"github.com/gluonfield/jaz-tasks/backend/internal/server"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
)

type response struct {
	Data   map[string]any `json:"data"`
	Errors []struct {
		Message    string         `json:"message"`
		Extensions map[string]any `json:"extensions"`
	} `json:"errors"`
}

type client struct {
	t     *testing.T
	url   string
	key   string
	vars  map[string]string
	store *postgres.Store
}

func newClient(t *testing.T) *client {
	t.Helper()
	store := postgrestest.New(t)
	keys := auth.NewService(store, auth.Config{PublicURL: "http://tasks.test"})
	svc := tracker.NewService(store, "http://tasks.test")
	result, _, err := seed.Run(context.Background(), store, keys, svc)
	if err != nil {
		t.Fatal(err)
	}
	logger := log.New(io.Discard)
	people := workspaces.NewService(store, workspaces.Config{})
	authn, err := authapi.NewHandler(keys, people, signin.Config{}, logger)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(server.New(authn, gql.NewHandler(svc, people, keys, logger), mcpapi.NewHandler(svc, keys, gql.NewHandler(svc, people, keys, logger)), "", logger))
	t.Cleanup(srv.Close)
	return &client{t: t, url: srv.URL + "/graphql", key: result.APIKey, vars: map[string]string{}, store: store}
}

// do posts a document the way linear-cli's api.Query does: the raw key in
// Authorization and a JSON body holding only the query.
func (c *client) do(query, authorization string) (int, response) {
	c.t.Helper()
	for name, value := range c.vars {
		query = strings.ReplaceAll(query, "{{"+name+"}}", value)
	}
	body, _ := json.Marshal(map[string]string{"query": query})
	req, _ := http.NewRequest(http.MethodPost, c.url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", authorization)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var out response
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		c.t.Fatal(err)
	}
	return res.StatusCode, out
}

func (c *client) fixture(name string) response {
	c.t.Helper()
	doc, err := os.ReadFile(filepath.Join("testdata", "linear-cli", name+".graphql"))
	if err != nil {
		c.t.Fatal(err)
	}
	_, out := c.do(string(doc), c.key)
	return out
}

// get walks a dotted path through decoded JSON; "#" yields a list's length.
func get(v any, path string) any {
	for _, part := range strings.Split(path, ".") {
		switch node := v.(type) {
		case map[string]any:
			v = node[part]
		case []any:
			if part == "#" {
				return float64(len(node))
			}
			i, err := strconv.Atoi(part)
			if err != nil || i >= len(node) {
				return nil
			}
			v = node[i]
		default:
			return nil
		}
	}
	return v
}

func TestLinearCLIOperations(t *testing.T) {
	c := newClient(t)
	ids := c.fixture("resolve_team")
	c.vars["teamId"] = get(ids.Data, "teams.nodes.0.id").(string)
	c.vars["viewerId"] = get(c.fixture("viewer_id").Data, "viewer.id").(string)
	c.vars["projectId"] = get(c.fixture("resolve_project").Data, "projects.nodes.0.id").(string)
	states := c.fixture("team_states")
	for _, node := range get(states.Data, "workflowStates.nodes").([]any) {
		if get(node, "name") == "In Review" {
			c.vars["stateId"] = get(node, "id").(string)
		}
	}

	cases := []struct {
		fixture string
		want    map[string]any
	}{
		{"me", map[string]any{"viewer.name": "Mira Chen", "viewer.email": "mira@jaz.local"}},
		{"viewer_name", map[string]any{"viewer.name": "Mira Chen"}},
		{"viewer_email", map[string]any{"viewer.email": "mira@jaz.local"}},
		{"resolve_team", map[string]any{"teams.nodes.#": 1.0, "teams.nodes.0.key": "ENG", "teams.nodes.0.name": "Engineering"}},
		{"resolve_project", map[string]any{"projects.nodes.#": 1.0, "projects.nodes.0.name": "Tasks MVP"}},
		{"team_states", map[string]any{"workflowStates.nodes.#": 6.0}},
		{"teams", map[string]any{"teams.nodes.#": 2.0, "teams.nodes.0.key": "DES"}},
		{"users", map[string]any{"users.nodes.#": 5.0, "users.nodes.0.active": true, "users.nodes.0.guest": false, "users.nodes.0.lastSeen": nil}},
		{"user_by_name", map[string]any{"users.nodes.#": 1.0, "users.nodes.0.name": "Sofia Alvarez"}},
		{"create", map[string]any{"issueCreate.issue.identifier": "ENG-21", "issueCreate.issue.title": "Ship the CLI fixtures", "issueCreate.issue.url": "http://tasks.test/issue/ENG-21"}},
		{"update", map[string]any{"issueUpdate.success": true, "issueUpdate.issue.identifier": "ENG-7", "issueUpdate.issue.state.name": "In Review", "issueUpdate.issue.assignee.name": "Mira Chen", "issueUpdate.issue.priority": 1.0}},
		{"update_clear", map[string]any{"issueUpdate.success": true, "issueUpdate.issue.priority": 0.0}},
		{"issue_team", map[string]any{"issue.team.id": c.vars["teamId"]}},
		{"list", map[string]any{"issues.nodes.#": 2.0, "issues.nodes.0.identifier": "ENG-21", "issues.nodes.1.identifier": "ENG-8", "issues.nodes.1.project.name": "Tasks MVP"}},
		{"list_by_name", map[string]any{"issues.nodes.#": 4.0}},
		{"list_all", map[string]any{"issues.nodes.#": 20.0}},
		{"get", map[string]any{"issue.identifier": "ENG-1", "issue.team.key": "ENG", "issue.state.name": "Done", "issue.labels.nodes.0.name": "Feature", "issue.comments.nodes.#": 2.0, "issue.comments.nodes.0.user.name": "Jonas Petrauskas", "issue.url": "http://tasks.test/issue/ENG-1"}},
		{"my_issues", map[string]any{"issues.nodes.#": 4.0}},
		{"search", map[string]any{"searchIssues.nodes.#": 2.0, "searchIssues.nodes.0.identifier": "ENG-9", "searchIssues.nodes.1.identifier": "ENG-5"}},
		{"comment", map[string]any{"commentCreate.comment.body": "Looks good — shipping."}},
		{"comments", map[string]any{"issue.comments.nodes.#": 3.0, "issue.comments.nodes.2.user.name": "Mira Chen"}},
		{"delete", map[string]any{"issueDelete.success": true}},
		{"archive", map[string]any{"issueArchive.success": true}},
		{"unarchive", map[string]any{"issueUnarchive.success": true}},
		{"states", map[string]any{"workflowStates.nodes.#": 6.0, "workflowStates.nodes.0.name": "Backlog", "workflowStates.nodes.0.type": "backlog", "workflowStates.nodes.0.team.key": "ENG"}},
		{"state_create", map[string]any{"workflowStateCreate.workflowState.name": "QA", "workflowStateCreate.workflowState.type": "started"}},
		{"labels", map[string]any{"issueLabels.nodes.#": 1.0, "issueLabels.nodes.0.name": "Polish", "issueLabels.nodes.0.isGroup": false}},
		{"label_create", map[string]any{"issueLabelCreate.issueLabel.name": "Security", "issueLabelCreate.issueLabel.color": "#eb5757"}},
		{"cycles", map[string]any{"cycles.nodes.#": 3.0, "cycles.nodes.1.isActive": true, "cycles.nodes.0.team.key": "ENG"}},
		{"cycle_create", map[string]any{"cycleCreate.cycle.name": "Hardening", "cycleCreate.cycle.number": 4.0}},
		{"projects", map[string]any{"projects.nodes.#": 1.0, "projects.nodes.0.status.name": "In Progress", "projects.nodes.0.lead.email": "mira@jaz.local"}},
	}
	for _, tc := range cases {
		out := c.fixture(tc.fixture)
		if len(out.Errors) > 0 {
			t.Errorf("%s: errors %+v", tc.fixture, out.Errors)
			continue
		}
		for path, want := range tc.want {
			if got := get(out.Data, path); got != want {
				t.Errorf("%s: %s = %#v, want %#v", tc.fixture, path, got, want)
			}
		}
		if tc.fixture == "label_create" {
			c.vars["labelId"] = get(out.Data, "issueLabelCreate.issueLabel.id").(string)
		}
	}
	if out := c.fixture("label_delete"); len(out.Errors) > 0 || get(out.Data, "issueLabelDelete.success") != true {
		t.Errorf("label_delete: %+v", out)
	}
	if out := c.fixture("get"); get(out.Data, "issue.identifier") != "ENG-1" {
		t.Errorf("get after mutations: %+v", out)
	}
}

// linear-cli also sends documents that Linear's own schema rejects; mirroring
// Linear means rejecting them the same way rather than bending the schema.
func TestLinearCLIOperationsLinearRejects(t *testing.T) {
	c := newClient(t)
	c.vars["teamId"] = "00000000-0000-0000-0000-000000000000"
	c.vars["projectId"] = c.vars["teamId"]
	for _, name := range []string{
		"invalid_list_search", "invalid_add_label", "invalid_project_create", "invalid_project_update", "invalid_batch",
		"unsupported_documents", "unsupported_initiatives", "unsupported_notifications", "unsupported_webhooks",
	} {
		out := c.fixture(name)
		if len(out.Errors) == 0 || out.Data != nil {
			t.Errorf("%s: expected a validation error, got %+v", name, out)
		}
	}
}

func TestAuthentication(t *testing.T) {
	c := newClient(t)
	if status, out := c.do("query { viewer { id } }", ""); status != http.StatusUnauthorized || get(out.Errors[0].Extensions, "code") != "AUTHENTICATION_ERROR" {
		t.Fatalf("missing key: status %d, %+v", status, out)
	}
	if status, _ := c.do("query { viewer { id } }", "jt_api_wrong"); status != http.StatusUnauthorized {
		t.Fatalf("wrong key: status %d", status)
	}
	if status, out := c.do("query { viewer { name } }", "Bearer "+c.key); status != http.StatusOK || get(out.Data, "viewer.name") != "Mira Chen" {
		t.Fatalf("bearer key: status %d, %+v", status, out)
	}
}

func TestErrorsUseLinearShape(t *testing.T) {
	c := newClient(t)
	_, out := c.do(`query { issue(id: "ENG-999") { id } }`, c.key)
	if len(out.Errors) != 1 || out.Errors[0].Message != "Entity not found: Issue" || out.Errors[0].Extensions["code"] != "INPUT_ERROR" {
		t.Fatalf("not found: %+v", out)
	}
	_, out = c.do(`mutation { issueUpdate(id: "ENG-1", input: { priority: 9 }) { success } }`, c.key)
	if len(out.Errors) != 1 || out.Errors[0].Extensions["type"] != "invalid input" {
		t.Fatalf("invalid input: %+v", out)
	}
}

// Nested connections narrow the caller's filter to their owner, with or
// without a filter argument.
func TestNestedIssueConnections(t *testing.T) {
	c := newClient(t)
	_, out := c.do(`{
		team(id: "DES") { issues { nodes { identifier } } }
		viewer { assignedIssues(filter: { state: { type: { eq: "completed" } } }) { nodes { identifier } } }
		issue(id: "ENG-11") { children { nodes { identifier } } }
		cycles(filter: { isActive: { eq: true } }) { nodes { issues { nodes { identifier } } } }
		teams(filter: { key: { eq: "ENG" } }) { nodes { issues(filter: { team: { key: { eq: "DES" } } }) { nodes { identifier } } } }
	}`, c.key)
	if len(out.Errors) > 0 {
		t.Fatalf("errors = %+v", out.Errors)
	}
	for path, want := range map[string]any{
		"team.issues.nodes.#":           5.0,
		"viewer.assignedIssues.nodes.#": 1.0,
		"issue.children.nodes.#":        2.0,
		"cycles.nodes.0.issues.nodes.#": 6.0,
		"teams.nodes.0.issues.nodes.#":  0.0,
	} {
		if got := get(out.Data, path); got != want {
			t.Errorf("%s = %#v, want %#v", path, got, want)
		}
	}
}

// content is Linear's project brief: markdown beside the one-line description,
// set on create, replaced on update, kept when omitted and cleared by null.
func TestProjectContent(t *testing.T) {
	c := newClient(t)
	_, out := c.do(`{ teams(filter: { key: { eq: "ENG" } }) { nodes { id } } }`, c.key)
	team, _ := get(out.Data, "teams.nodes.0.id").(string)
	_, out = c.do(`mutation { projectCreate(input: { name: "Brief", teamIds: ["`+team+`"], description: "One line", content: "## Goal\nShip it", startDate: "2026-10-05" }) {
		project { id content description startDate targetDate } } }`, c.key)
	id, _ := get(out.Data, "projectCreate.project.id").(string)
	if len(out.Errors) > 0 || get(out.Data, "projectCreate.project.content") != "## Goal\nShip it" || get(out.Data, "projectCreate.project.startDate") != "2026-10-05" {
		t.Fatalf("create: %+v %+v", out.Data, out.Errors)
	}
	for _, step := range []struct {
		input   string
		content any
	}{
		{`{ content: "Revised" }`, "Revised"},
		{`{ targetDate: "2026-11-20" }`, "Revised"},
		{`{ content: null }`, nil},
	} {
		_, out = c.do(`mutation { projectUpdate(id: "`+id+`", input: `+step.input+`) { project { content description } } }`, c.key)
		if len(out.Errors) > 0 || get(out.Data, "projectUpdate.project.content") != step.content || get(out.Data, "projectUpdate.project.description") != "One line" {
			t.Fatalf("update %s: %+v %+v", step.input, out.Data, out.Errors)
		}
	}
}
