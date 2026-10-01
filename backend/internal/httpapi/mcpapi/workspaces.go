package mcpapi

import (
	"context"
	"errors"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type workspaceView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Current bool   `json:"current"`
}

type workspacesOutput struct {
	Workspaces []workspaceView `json:"workspaces"`
}

type switchWorkspaceInput struct {
	WorkspaceID string `json:"workspace_id" jsonschema:"a workspace id from list_workspaces"`
}

type createWorkspaceInput struct {
	Name string `json:"name" jsonschema:"the workspace name, also given to its first team"`
}

// registerWorkspaces lets an agent move its connection between the person's
// workspaces, as the workspace menu does.
func registerWorkspaces(server *mcp.Server, members *workspaces.Service, keys *auth.Service, t tools) {
	addTool(server, &mcp.Tool{Name: "list_workspaces", Title: "List workspaces", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
		Description: "The workspaces you belong to; current is the one these calls act in."},
		func(ctx context.Context, req *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, workspacesOutput, error) {
			actor := t.actor(req)
			list, err := members.Memberships(ctx, actor)
			out := workspacesOutput{Workspaces: []workspaceView{}}
			for _, m := range list {
				out.Workspaces = append(out.Workspaces, workspaceView{ID: m.WorkspaceID, Name: m.Name, Current: m.UserID == actor.UserID})
			}
			return nil, out, err
		})
	addTool(server, &mcp.Tool{Name: "switch_workspace", Title: "Switch workspace",
		Description: "Move this connection to another of your workspaces; later calls act there, as do the Jaz Tasks app and other agents sharing the connection. An API key stays in its own workspace."},
		func(ctx context.Context, req *mcp.CallToolRequest, in switchWorkspaceInput) (*mcp.CallToolResult, workspaceView, error) {
			actor := t.actor(req)
			m, err := members.Switch(ctx, actor, in.WorkspaceID)
			if err != nil {
				return nil, workspaceView{}, err
			}
			return nil, workspaceView{ID: m.WorkspaceID, Name: m.Name, Current: true}, keys.Switch(ctx, actor, m.UserID)
		})
	addTool(server, &mcp.Tool{Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false)}, Name: "create_workspace", Title: "Create workspace",
		Description: "Start a workspace with you as its admin and a first team named after it, and move this connection there unless it uses an API key."},
		func(ctx context.Context, req *mcp.CallToolRequest, in createWorkspaceInput) (*mcp.CallToolResult, workspaceView, error) {
			actor := t.actor(req)
			m, err := members.Create(ctx, actor, in.Name)
			if err != nil {
				return nil, workspaceView{}, err
			}
			err = keys.Switch(ctx, actor, m.UserID)
			if err != nil && !errors.Is(err, auth.ErrFixedWorkspace) {
				return nil, workspaceView{}, err
			}
			return nil, workspaceView{ID: m.WorkspaceID, Name: m.Name, Current: err == nil}, nil
		})
}
