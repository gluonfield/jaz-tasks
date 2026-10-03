package mcpapi_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestSelectedIssuesPresentation(t *testing.T) {
	s, _ := connect(t)
	ctx := context.Background()
	call[issue](t, s, "update_issue", map[string]any{"issue": "ENG-4", "title": "A current title", "state": "In Progress", "dueDate": "2026-12-01"})
	args := map[string]any{
		"title": " Today's focus ",
		"issues": []map[string]string{
			{"issue": "eng-4", "reason": " Finish the customer work first. "},
			{"issue": "ENG-1", "reason": "Unblock the next step."},
		},
	}
	result, err := s.CallTool(ctx, &mcp.CallToolParams{Name: "show_issues", Arguments: args})
	if err != nil || result.IsError {
		t.Fatalf("presentation: %+v, %v", result, err)
	}
	var shown struct {
		Title  string `json:"title"`
		Issues []struct {
			issue
			Reason string `json:"reason"`
		} `json:"issues"`
	}
	raw, _ := json.Marshal(result.StructuredContent)
	if err := json.Unmarshal(raw, &shown); err != nil {
		t.Fatal(err)
	}
	if shown.Title != "Today's focus" || len(shown.Issues) != 2 || shown.Issues[0].Identifier != "ENG-4" || shown.Issues[1].Identifier != "ENG-1" ||
		shown.Issues[0].Title != "A current title" || shown.Issues[0].State != "In Progress" || shown.Issues[0].DueDate != "2026-12-01" || shown.Issues[0].Reason != "Finish the customer work first." {
		t.Fatalf("selection lost order, current data or explanation: %s", raw)
	}
	link, ok := result.Content[0].(*mcp.ResourceLink)
	if !ok || link.URI != "ui://jaz-tasks/issue" || link.MIMEType != "text/html;profile=mcp-app" || len(result.Content) != 1 {
		t.Fatalf("presentation must return its resource: %+v", result.Content)
	}
	colors, _ := result.Meta["jaz-tasks/stateColors"].(map[string]any)
	if colors["ENG-4"] != "#f2c94c" {
		t.Fatalf("state colors missing from card metadata: %+v", result.Meta)
	}
	for tool, args := range map[string]map[string]any{"list_issues": {"limit": 2}, "get_issue": {"issue": "ENG-4"}} {
		lookup, err := s.CallTool(ctx, &mcp.CallToolParams{Name: tool, Arguments: args})
		if err != nil || lookup.IsError {
			t.Fatalf("%s: %+v, %v", tool, lookup, err)
		}
		for _, content := range lookup.Content {
			if _, ok := content.(*mcp.ResourceLink); ok {
				t.Fatalf("%s unexpectedly presents a resource", tool)
			}
		}
	}
	for _, selected := range [][]map[string]string{
		{},
		{{"issue": "ENG-4"}, {"issue": "eng-4"}},
		{{"issue": "ENG-4"}, {"issue": "MISSING-42"}},
	} {
		result, err := s.CallTool(ctx, &mcp.CallToolParams{Name: "show_issues", Arguments: map[string]any{"issues": selected}})
		if err != nil || !result.IsError {
			t.Fatalf("invalid selection must fail without presenting a partial list: %+v, %v", result, err)
		}
	}
}
