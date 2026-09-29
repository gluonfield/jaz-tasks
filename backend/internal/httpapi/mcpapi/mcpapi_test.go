package mcpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/mcpapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/seed"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type bearer struct {
	key string
}

func (b bearer) RoundTrip(req *http.Request) (*http.Response, error) {
	req = req.Clone(req.Context())
	req.Header.Set("Authorization", "Bearer "+b.key)
	return http.DefaultTransport.RoundTrip(req)
}

func connect(t *testing.T) (*mcp.ClientSession, string) {
	t.Helper()
	ctx := context.Background()
	store := postgrestest.New(t)
	keys := auth.NewService(store, auth.Config{PublicURL: "http://tasks.test"})
	svc := tracker.NewService(store, "http://tasks.test")
	result, _, err := seed.Run(ctx, store, keys, svc, "")
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(mcpapi.NewHandler(svc, keys))
	t.Cleanup(srv.Close)
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint:   srv.URL,
		HTTPClient: &http.Client{Transport: bearer{key: result.APIKey}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session, srv.URL
}

func call[T any](t *testing.T, session *mcp.ClientSession, name string, args map[string]any) T {
	t.Helper()
	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	if res.IsError {
		t.Fatalf("%s: %s", name, res.Content[0].(*mcp.TextContent).Text)
	}
	var out T
	raw, _ := json.Marshal(res.StructuredContent)
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

type issue struct {
	Identifier string   `json:"identifier"`
	Title      string   `json:"title"`
	State      string   `json:"state"`
	Priority   string   `json:"priority"`
	Assignee   string   `json:"assignee"`
	Project    string   `json:"project"`
	Labels     []string `json:"labels"`
	DueDate    string   `json:"dueDate"`
	Parent     string   `json:"parent"`
	SubIssues  []issue  `json:"subIssues"`
	Comments   []struct {
		Author string `json:"author"`
		Body   string `json:"body"`
	} `json:"comments"`
}

func TestAgentWorkflow(t *testing.T) {
	session, _ := connect(t)
	tools, err := session.ListTools(context.Background(), nil)
	if err != nil || len(tools.Tools) != 8 {
		t.Fatalf("tools = %d, err %v", len(tools.Tools), err)
	}

	teams := call[struct {
		Teams []struct {
			Key    string   `json:"key"`
			Labels []string `json:"labels"`
		} `json:"teams"`
	}](t, session, "list_teams", nil)
	if len(teams.Teams) != 2 || teams.Teams[1].Key != "ENG" {
		t.Fatalf("teams = %+v", teams)
	}

	created := call[issue](t, session, "create_issue", map[string]any{
		"team": "eng", "title": "Triage agent inbox", "description": "From **MCP**",
		"state": "in progress", "priority": 2, "assignee": "me", "labels": []string{"bug", "Feature"},
		"project": "Tasks MVP", "dueDate": "2026-12-01", "parent": "ENG-11",
	})
	if created.Identifier != "ENG-21" || created.State != "In Progress" || created.Assignee != "Mira Chen" ||
		created.Project != "Tasks MVP" || len(created.Labels) != 2 || created.DueDate != "2026-12-01" || created.Parent != "ENG-11" {
		t.Fatalf("created = %+v", created)
	}

	updated := call[issue](t, session, "update_issue", map[string]any{
		"issue": "ENG-21", "state": "Done", "assignee": "none", "removeLabels": []string{"Bug"}, "dueDate": "none", "priority": 1,
	})
	if updated.State != "Done" || updated.Assignee != "" || len(updated.Labels) != 1 || updated.DueDate != "" || updated.Priority != "Urgent" {
		t.Fatalf("updated = %+v", updated)
	}

	call[struct{}](t, session, "add_comment", map[string]any{"issue": "ENG-21", "body": "Closed by the agent."})
	got := call[issue](t, session, "get_issue", map[string]any{"issue": "eng-21"})
	if len(got.Comments) != 1 || got.Comments[0].Author != "Mira Chen" {
		t.Fatalf("get = %+v", got)
	}
	parent := call[issue](t, session, "get_issue", map[string]any{"issue": "ENG-11"})
	if len(parent.SubIssues) != 3 || parent.SubIssues[0].Identifier != "ENG-21" {
		t.Fatalf("parent sub-issues = %+v", parent.SubIssues)
	}

	listed := call[struct {
		Issues []issue `json:"issues"`
	}](t, session, "list_issues", map[string]any{"team": "Engineering", "state": "completed", "label": "feature"})
	if len(listed.Issues) != 4 {
		t.Fatalf("listed = %+v", listed.Issues)
	}
	unassigned := call[struct {
		Issues []issue `json:"issues"`
	}](t, session, "list_issues", map[string]any{"assignee": "none", "query": "webhook"})
	if len(unassigned.Issues) != 1 || unassigned.Issues[0].Identifier != "ENG-17" {
		t.Fatalf("unassigned = %+v", unassigned.Issues)
	}

	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "update_issue", Arguments: map[string]any{"issue": "ENG-21", "assignee": "Nobody"}})
	if err != nil || !res.IsError || !strings.Contains(res.Content[0].(*mcp.TextContent).Text, `no user named "Nobody"`) {
		t.Fatalf("bad assignee: %+v, %v", res, err)
	}
}

func TestRejectsMissingKey(t *testing.T) {
	_, url := connect(t)
	res, err := http.Post(url, "application/json", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d", res.StatusCode)
	}
}
