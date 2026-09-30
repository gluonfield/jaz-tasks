package mcpapi_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/charmbracelet/log"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/gql"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/mcpapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/seed"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
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

type env struct {
	url   string
	key   string
	store *postgres.Store
	svc   *tracker.Service
	keys  *auth.Service
}

func serve(t *testing.T) env {
	t.Helper()
	store := postgrestest.New(t)
	keys := auth.NewService(store, auth.Config{PublicURL: "http://tasks.test"})
	svc := tracker.NewService(store, "http://tasks.test")
	result, _, err := seed.Run(context.Background(), store, keys, svc)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(mcpapi.NewHandler(svc, keys, gql.NewHandler(svc, workspaces.NewService(store, workspaces.Config{}), keys, log.New(io.Discard))))
	t.Cleanup(srv.Close)
	return env{url: srv.URL, key: result.APIKey, store: store, svc: svc, keys: keys}
}

func (e env) session(t *testing.T, key string) *mcp.ClientSession {
	t.Helper()
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint:   e.url,
		HTTPClient: &http.Client{Transport: bearer{key: key}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session
}

func connect(t *testing.T) (*mcp.ClientSession, string) {
	e := serve(t)
	return e.session(t, e.key), e.url
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
	if err != nil || len(tools.Tools) != 10 {
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

// Tenant B's agent cannot reach tenant A's workspace through any tool, by
// id or by an identifier that also exists in B's workspace.
func TestTenantIsolationMCP(t *testing.T) {
	e := serve(t)
	ctx := context.Background()
	a := e.session(t, e.key)
	issueA := call[struct {
		ID string `json:"id"`
	}](t, a, "get_issue", map[string]any{"issue": "ENG-1"})

	user, err := workspaces.NewService(e.store, workspaces.Config{}).SignIn(ctx, auth.Identity{
		Issuer: "https://idp.test", Subject: "bob", Email: "bob@b.test", EmailVerified: true, Name: "Bob Stone",
	})
	if err != nil {
		t.Fatal(err)
	}
	keyB, _, err := e.keys.CreateKey(ctx, user.ID, "agent", "")
	if err != nil {
		t.Fatal(err)
	}
	b := e.session(t, keyB)
	call[issue](t, b, "create_issue", map[string]any{"team": "BOB", "title": "Bob's own"})

	for name, args := range map[string]map[string]any{
		"get_issue":    {"issue": issueA.ID},
		"update_issue": {"issue": issueA.ID, "title": "owned"},
		"add_comment":  {"issue": issueA.ID, "body": "hi"},
		"create_issue": {"team": "ENG", "title": "x"},
	} {
		res, err := b.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: args})
		if err != nil || !res.IsError {
			t.Errorf("%s reached tenant A: %+v %v", name, res, err)
		}
	}
	res, _ := b.CallTool(ctx, &mcp.CallToolParams{Name: "update_issue", Arguments: map[string]any{"issue": "BOB-1", "assignee": "mira@jaz.local"}})
	if !res.IsError {
		t.Errorf("assigned tenant A's user")
	}
	leaked := call[struct {
		Data   map[string]any `json:"data"`
		Errors []any          `json:"errors"`
	}](t, b, "graphql", map[string]any{"query": `mutation { issueUpdate(id: "` + issueA.ID + `", input: { title: "owned" }) { success } }`})
	if len(leaked.Errors) == 0 {
		t.Errorf("graphql tool reached tenant A: %+v", leaked.Data)
	}
	listed := call[struct {
		Issues []issue `json:"issues"`
	}](t, b, "list_issues", nil)
	users := call[struct {
		Users []struct{ Email string } `json:"users"`
	}](t, b, "list_users", nil)
	projects := call[struct {
		Projects []struct{ Name string } `json:"projects"`
	}](t, b, "list_projects", nil)
	if len(listed.Issues) != 1 || listed.Issues[0].Identifier != "BOB-1" || len(users.Users) != 1 || len(projects.Projects) != 0 {
		t.Fatalf("tenant B sees: %+v %+v %+v", listed, users, projects)
	}
	if got := call[issue](t, a, "get_issue", map[string]any{"issue": "ENG-1"}); got.Title != "Linear-compatible GraphQL endpoint" || len(got.Comments) != 2 {
		t.Fatalf("tenant A changed: %+v", got)
	}
}

// The MCP App resource and its tools: show_tasks opens the UI, and the app
// talks GraphQL through a tool only the app may call.
func TestMCPApp(t *testing.T) {
	e := serve(t)
	s := e.session(t, e.key)
	ctx := context.Background()
	resources, err := s.ListResources(ctx, nil)
	if err != nil || len(resources.Resources) != 2 {
		t.Fatalf("resources: %+v %v", resources, err)
	}
	for _, resource := range resources.Resources {
		if resource.MIMEType != "text/html;profile=mcp-app" {
			t.Fatalf("resource %s has MIME type %s", resource.URI, resource.MIMEType)
		}
	}
	card, err := s.ReadResource(ctx, &mcp.ReadResourceParams{URI: "ui://jaz-tasks/issue"})
	if err != nil || !strings.Contains(card.Contents[0].Text, "codex://plugins/jaz-tasks/app/show_tasks") || strings.Contains(card.Contents[0].Text, `src="http`) {
		t.Fatalf("issue card: %v", err)
	}
	read, err := s.ReadResource(ctx, &mcp.ReadResourceParams{URI: "ui://jaz-tasks/app"})
	if err != nil || len(read.Contents) != 1 || read.Contents[0].MIMEType != "text/html;profile=mcp-app" {
		t.Fatalf("read: %v", err)
	}
	html := read.Contents[0].Text
	if !strings.Contains(html, `<div id="root"`) || !strings.Contains(html, "<style") || !strings.Contains(html, "data:font/woff2") {
		t.Fatalf("app HTML is not the self-contained build (%d bytes)", len(html))
	}
	for _, external := range []string{`src="http`, `href="http`, `url(/`, `url(http`, "import.meta.url"} {
		if strings.Contains(html, external) {
			t.Fatalf("app HTML references an external asset: %s", external)
		}
	}
	initialize := s.InitializeResult()
	icons := initialize.ServerInfo.Icons
	if initialize.ServerInfo.Name != "jaz-tasks" || initialize.ServerInfo.Title != "Jaz Tasks" || len(icons) != 2 ||
		icons[0].Theme != mcp.IconThemeLight || icons[1].Theme != mcp.IconThemeDark ||
		!strings.HasPrefix(icons[0].Source, "data:image/svg+xml;base64,") || !strings.HasPrefix(icons[1].Source, "data:image/svg+xml;base64,") {
		t.Fatalf("server info: %+v", initialize.ServerInfo)
	}
	tools, _ := s.ListTools(ctx, nil)
	meta := map[string]mcp.Meta{}
	for _, tool := range tools.Tools {
		meta[tool.Name] = tool.Meta
	}
	if ui, _ := meta["show_tasks"]["ui"].(map[string]any); ui["resourceUri"] != "ui://jaz-tasks/app" {
		t.Fatalf("show_tasks meta: %+v", meta["show_tasks"])
	}
	if openai, _ := meta["show_tasks"]["openai/ui"].(map[string]any); fmt.Sprint(openai["entrypoints"]) != "[map[type:global]]" {
		t.Fatalf("show_tasks should be a global entrypoint: %+v", meta["show_tasks"])
	}
	if ui, _ := meta["create_issue"]["ui"].(map[string]any); ui["resourceUri"] != "ui://jaz-tasks/issue" {
		t.Fatalf("create_issue should show the issue card: %+v", meta["create_issue"])
	}
	if ui, _ := meta["graphql"]["ui"].(map[string]any); fmt.Sprint(ui["visibility"]) != "[app]" {
		t.Fatalf("graphql meta: %+v", meta["graphql"])
	}
	shown := call[struct {
		URL string `json:"url"`
	}](t, s, "show_tasks", map[string]any{"view": "eng-4"})
	if shown.URL != "http://tasks.test/issue/ENG-4" {
		t.Fatalf("show_tasks: %+v", shown)
	}
	res, err := s.CallTool(ctx, &mcp.CallToolParams{Name: "graphql", Arguments: map[string]any{
		"query":         `query Other { viewer { id } } mutation Bump($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { issue { identifier priorityLabel } } }`,
		"operationName": "Bump",
		"variables":     map[string]any{"id": "ENG-4", "input": map[string]any{"priority": 4}},
	}})
	want := `{"data":{"issueUpdate":{"issue":{"identifier":"ENG-4","priorityLabel":"Low"}}}}`
	if err != nil || res.IsError || res.Content[0].(*mcp.TextContent).Text != want {
		t.Fatalf("graphql tool: %+v %v", res, err)
	}

	// The card draws the state in its color, which only the card receives.
	created, err := s.CallTool(ctx, &mcp.CallToolParams{Name: "create_issue", Arguments: map[string]any{"team": "ENG", "title": "Card", "state": "In Progress"}})
	if err != nil || created.IsError || created.Meta["jaz-tasks/stateColor"] != "#f2c94c" || strings.Contains(created.Content[0].(*mcp.TextContent).Text, "#f2c94c") {
		t.Fatalf("create_issue result: %+v %v", created, err)
	}
}

// oauth completes the OAuth flow an MCP host such as Jaz runs for user and
// returns the access token its connection sends.
func (e env) oauth(t *testing.T, user storage.User) string {
	t.Helper()
	ctx := context.Background()
	app, err := e.keys.RegisterClient(ctx, "Jaz", []string{"http://localhost/cb"})
	if err != nil {
		t.Fatal(err)
	}
	verifier := strings.Repeat("verifier", 8)
	sum := sha256.Sum256([]byte(verifier))
	target, err := e.keys.Approve(ctx, auth.Actor{UserID: user.ID, WorkspaceID: user.WorkspaceID}, auth.AuthorizeRequest{
		ResponseType: "code", ClientID: app.ID, RedirectURI: "http://localhost/cb",
		CodeChallenge: base64.RawURLEncoding.EncodeToString(sum[:]), CodeChallengeMethod: "S256",
	})
	if err != nil {
		t.Fatal(err)
	}
	redirect, _ := url.Parse(target)
	tokens, err := e.keys.Token(ctx, auth.TokenRequest{
		GrantType: "authorization_code", ClientID: app.ID, Code: redirect.Query().Get("code"),
		RedirectURI: "http://localhost/cb", CodeVerifier: verifier,
	})
	if err != nil {
		t.Fatal(err)
	}
	return tokens.AccessToken
}

// Switching workspace from the app keeps the host's MCP session working, now
// in the other workspace: the SDK binds a session to whoever opened it.
func TestWorkspaceSwitchKeepsTheSession(t *testing.T) {
	e := serve(t)
	pat, err := workspaces.NewService(e.store, workspaces.Config{}).SignIn(context.Background(), auth.Identity{
		Issuer: "https://idp.test", Subject: "pat", Email: "pat@example.com", EmailVerified: true, Name: "Pat",
	})
	if err != nil {
		t.Fatal(err)
	}
	type result struct {
		Data struct {
			Workspaces []struct {
				ID      string `json:"id"`
				Current bool   `json:"current"`
			} `json:"workspaces"`
		} `json:"data"`
		Errors []any `json:"errors"`
	}
	call[result](t, e.session(t, e.key), "graphql", map[string]any{"query": `mutation { organizationInviteCreate(input: { email: "pat@example.com" }) { success } }`})
	jaz := e.session(t, e.oauth(t, pat))
	listed := call[result](t, jaz, "graphql", map[string]any{"query": `{ workspaces { id current } }`})
	var team string
	for _, w := range listed.Data.Workspaces {
		if !w.Current {
			team = w.ID
		}
	}
	if len(listed.Data.Workspaces) != 2 || team == "" {
		t.Fatalf("workspaces: %+v", listed)
	}
	if switched := call[result](t, jaz, "graphql", map[string]any{"query": `mutation { workspaceSwitch(id: "` + team + `") { success } }`}); len(switched.Errors) > 0 {
		t.Fatalf("switch: %+v", switched.Errors)
	}
	if got := call[issue](t, jaz, "get_issue", map[string]any{"issue": "ENG-1"}); got.Identifier != "ENG-1" {
		t.Fatalf("after switching, the same session should reach the team workspace: %+v", got)
	}
}
