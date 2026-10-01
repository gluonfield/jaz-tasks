package mcpapi

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type workspaceView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Default bool   `json:"default,omitempty"`
}

type workspacesOutput struct {
	Workspaces []workspaceView `json:"workspaces"`
}

type createWorkspaceInput struct {
	Name string `json:"name" jsonschema:"the workspace name, also given to its first team"`
}

// registerWorkspaces tells agents which workspaces other tools can name, and
// lets them start one.
func registerWorkspaces(server *mcp.Server, t tools) {
	addUnscopedTool(server, &mcp.Tool{Name: "list_workspaces", Title: "List workspaces", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
		Description: "The workspaces you belong to. Other tools act in the default one unless their workspace argument names another."},
		func(ctx context.Context, req *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, workspacesOutput, error) {
			actor := t.actor(req)
			list, err := t.members.Memberships(ctx, actor)
			out := workspacesOutput{Workspaces: []workspaceView{}}
			for _, m := range list {
				out.Workspaces = append(out.Workspaces, workspaceView{ID: m.WorkspaceID, Name: m.Name, Default: m.UserID == actor.UserID})
			}
			return nil, out, err
		})
	addUnscopedTool(server, &mcp.Tool{Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false)}, Name: "create_workspace", Title: "Create workspace",
		Description: "Start a workspace with you as its admin and a first team named after it. Name it in other tools' workspace argument to work there; the default stays the same."},
		func(ctx context.Context, req *mcp.CallToolRequest, in createWorkspaceInput) (*mcp.CallToolResult, workspaceView, error) {
			m, err := t.members.Create(ctx, t.actor(req), in.Name)
			return nil, workspaceView{ID: m.WorkspaceID, Name: m.Name}, err
		})
}
