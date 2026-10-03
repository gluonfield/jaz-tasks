package mcpapi

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type showIssuesInput struct {
	Title  string `json:"title,omitempty" jsonschema:"short heading, such as Today's focus"`
	Issues []struct {
		Issue  string `json:"issue" jsonschema:"issue identifier or id"`
		Reason string `json:"reason,omitempty" jsonschema:"one short sentence explaining why this issue was selected"`
	} `json:"issues" jsonschema:"1 to 50 selected issues, in display order"`
}

type selectedIssue struct {
	issueView
	Reason string `json:"reason,omitempty"`
}

type shownIssues struct {
	Title  string          `json:"title,omitempty"`
	Issues []selectedIssue `json:"issues"`
}

func (t tools) showIssues(ctx context.Context, req *mcp.CallToolRequest, in showIssuesInput) (*mcp.CallToolResult, shownIssues, error) {
	if len(in.Issues) == 0 || len(in.Issues) > 50 {
		return nil, shownIssues{}, errors.New("select between 1 and 50 issues")
	}
	s := t.scope(req)
	out := shownIssues{Title: strings.TrimSpace(in.Title), Issues: make([]selectedIssue, 0, len(in.Issues))}
	colors := map[string]string{}
	for _, selected := range in.Issues {
		issue, err := s.Issue(ctx, selected.Issue)
		if err != nil {
			return nil, shownIssues{}, err
		}
		view, err := present(ctx, s, issue)
		if err != nil {
			return nil, shownIssues{}, err
		}
		if _, exists := colors[view.Identifier]; exists {
			return nil, shownIssues{}, fmt.Errorf("issue %s was selected twice", view.Identifier)
		}
		colors[view.Identifier] = view.stateColor
		out.Issues = append(out.Issues, selectedIssue{issueView: view, Reason: strings.TrimSpace(selected.Reason)})
	}
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.ResourceLink{URI: issueCardURI, Name: "Tasks", MIMEType: appMIME}},
		Meta:    mcp.Meta{"jaz-tasks/stateColors": colors},
	}, out, nil
}
