package mcpapi

import (
	"context"
	"strings"

	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type searchInput struct {
	Query string `json:"query" jsonschema:"words or an identifier such as ENG-123"`
}

type searchResult struct {
	ID    string   `json:"id"`
	Title string   `json:"title"`
	URL   string   `json:"url"`
	Text  string   `json:"text"`
	Meta  mcp.Meta `json:"_meta"`
}

type searchOutput struct {
	Results []searchResult `json:"results"`
}

const searchLimit int32 = 10

// search follows OpenAI's MCP search convention, which hosts call outside a
// conversation, such as Jaz's command palette. Each result's preview target,
// from OpenAI's MCP extensions, opens it in this server's app.
func (t tools) search(ctx context.Context, req *mcp.CallToolRequest, in searchInput) (*mcp.CallToolResult, searchOutput, error) {
	s := t.scope(req)
	page, err := s.Issues(ctx, tracker.IssueQuery{Search: in.Query, PageArgs: tracker.PageArgs{First: new(searchLimit)}})
	if err != nil {
		return nil, searchOutput{}, err
	}
	views, err := presentAll(ctx, s, page.Nodes)
	out := searchOutput{Results: make([]searchResult, len(views))}
	for i, view := range views {
		details := []string{view.Identifier, view.State}
		if view.Assignee != "" {
			details = append(details, view.Assignee)
		}
		target := map[string]any{"type": "mcp_app_tool", "name": "show_tasks", "arguments": showInput{View: view.Identifier}}
		out.Results[i] = searchResult{ID: view.Identifier, Title: view.Title, URL: view.URL, Text: strings.Join(details, " · "), Meta: mcp.Meta{"openai/preview": map[string]any{"target": target}}}
	}
	return nil, out, err
}
