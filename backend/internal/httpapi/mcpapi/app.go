package mcpapi

import (
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/gql"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// The MCP Apps (SEP-1865): self-contained ui:// resources that hosts render
// in a sandboxed iframe. The web app reaches the API through the graphql
// tool, which only the app may call; the issue card shows an issue
// create_issue made inline. `bun run build` in frontend regenerates app/.
const (
	appURI       = "ui://jaz-tasks/app"
	issueCardURI = "ui://jaz-tasks/issue"
	appMIME      = "text/html;profile=mcp-app"
)

var (
	//go:embed app/mcp-app.html
	appHTML string
	//go:embed app/issue-card.html
	issueCardHTML string
)

// glyph is the rail mark, a line-drawn circled check in the weight of the
// host's own navigation glyphs.
const glyph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="STROKE" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`

// icons strokes the glyph for light and dark backgrounds.
var icons = []mcp.Icon{
	{Source: iconSVG("#1f2328"), MIMEType: "image/svg+xml", Sizes: []string{"any"}, Theme: mcp.IconThemeLight},
	{Source: iconSVG("#e8e8e8"), MIMEType: "image/svg+xml", Sizes: []string{"any"}, Theme: mcp.IconThemeDark},
}

// toolIcon marks the sidebar entrypoint the way OpenAI's MCP extensions ask:
// one monochrome SVG in currentColor on a 20px grid with 1.33px strokes.
var toolIcon = mcp.Icon{
	Source:   "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8.33"/><path d="m7.5 10 1.67 1.67 3.33-3.33"/></svg>`)),
	MIMEType: "image/svg+xml",
	Sizes:    []string{"any"},
}

func iconSVG(stroke string) string {
	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(strings.Replace(glyph, "STROKE", stroke, 1)))
}

// favicon is the glyph for browser tabs, which follows the tab's colour scheme.
var favicon = strings.Replace(strings.Replace(glyph, "STROKE", "#1f2328", 1), "><", "><style>@media (prefers-color-scheme: dark){svg{stroke:#e8e8e8}}</style><", 1)

func Favicon(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "image/svg+xml")
	_, _ = io.WriteString(w, favicon)
}

func registerApp(server *mcp.Server, t tools, publicURL string) {
	addAppResource(server, appURI, "Jaz Tasks", appHTML, publicURL, []string{"fullscreen"})
	addAppResource(server, issueCardURI, "Jaz Tasks issue", issueCardHTML, publicURL, []string{"inline"})
	addTool(server, &mcp.Tool{
		Name: "show_tasks", Title: "Tasks",
		Description: "Open the Jaz Tasks app for the user at a team, an issue or a section.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
		Icons:       []mcp.Icon{toolIcon},
		// The global entrypoint puts the app in hosts' sidebars (OpenAI's MCP extensions).
		Meta: mcp.Meta{
			"ui":             map[string]any{"resourceUri": appURI},
			"ui/resourceUri": appURI,
			"openai/ui":      map[string]any{"entrypoints": []map[string]any{{"type": "global"}}},
		},
	}, t.showTasks)
	addTool(server, &mcp.Tool{
		Name: "graphql", Title: "GraphQL",
		Description: "Run a Linear-compatible GraphQL document. Used by the Jaz Tasks app.",
		Meta:        mcp.Meta{"ui": map[string]any{"visibility": []string{"app"}}},
	}, t.runGraphQL)
}

func addAppResource(server *mcp.Server, uri, title, html, publicURL string, modes []string) {
	server.AddResource(&mcp.Resource{URI: uri, Name: title, Title: title, MIMEType: appMIME},
		func(context.Context, *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
			return &mcp.ReadResourceResult{Contents: []*mcp.ResourceContents{{
				URI: uri, MIMEType: appMIME, Text: html, Meta: mcp.Meta{
					"ui":        map[string]any{"prefersBorder": false, "domain": publicURL, "csp": map[string]any{"connectDomains": []string{}, "resourceDomains": []string{}}},
					"openai/ui": map[string]any{"availableDisplayModes": modes},
				},
			}}}, nil
		})
}

type showInput struct {
	View string `json:"view,omitempty" jsonschema:"a team key such as ENG, an issue identifier such as ENG-12, or inbox, my-issues, projects or views"`
}

type showOutput struct {
	URL string `json:"url"`
}

func (t tools) showTasks(_ context.Context, req *mcp.CallToolRequest, in showInput) (*mcp.CallToolResult, showOutput, error) {
	path := "/"
	switch view := strings.TrimSpace(in.View); {
	case identifierLike(view):
		path = "/issue/" + strings.ToUpper(view)
	case view == "inbox", view == "my-issues", view == "projects", view == "views":
		path = "/" + view
	case view != "":
		path = "/team/" + strings.ToUpper(view) + "/all"
	}
	return nil, showOutput{URL: t.scope(req).URL(path)}, nil
}

func identifierLike(v string) bool {
	key, number, ok := strings.Cut(v, "-")
	return ok && key != "" && number != "" && strings.Trim(number, "0123456789") == ""
}

type graphqlInput struct {
	Query         string         `json:"query"`
	Variables     map[string]any `json:"variables,omitempty"`
	OperationName string         `json:"operationName,omitempty"`
}

// runGraphQL returns the GraphQL response JSON as structured content, which
// the SDK mirrors into a text block.
func (t tools) runGraphQL(ctx context.Context, req *mcp.CallToolRequest, in graphqlInput) (*mcp.CallToolResult, map[string]any, error) {
	variables, err := json.Marshal(in.Variables)
	if err != nil {
		return nil, nil, err
	}
	raw, err := json.Marshal(t.graphql.Execute(ctx, t.actor(req), gql.Request{Query: in.Query, OperationName: in.OperationName, Variables: variables}))
	if err != nil {
		return nil, nil, err
	}
	var out map[string]any
	return nil, out, json.Unmarshal(raw, &out)
}
