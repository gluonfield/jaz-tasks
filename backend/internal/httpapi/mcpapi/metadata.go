package mcpapi

import (
	"context"
	"encoding/json"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// addTool registers a tool that acts in one workspace: the one its optional
// workspace argument names, else the connection's default. The handler reads
// that actor through t.actor.
func addTool[In, Out any](server *mcp.Server, t tools, tool *mcp.Tool, handler mcp.ToolHandlerFor[In, Out]) {
	schema, err := jsonschema.For[In](nil)
	if err != nil {
		panic(err)
	}
	if schema.Properties == nil {
		schema.Properties = map[string]*jsonschema.Schema{}
	}
	schema.Properties["workspace"] = &jsonschema.Schema{Type: "string", Description: "name of the workspace to act in; omit for the default one (list_workspaces)"}
	tool.InputSchema = schema
	addUnscopedTool(server, tool, func(ctx context.Context, req *mcp.CallToolRequest, in In) (*mcp.CallToolResult, Out, error) {
		var args struct {
			Workspace string `json:"workspace"`
		}
		_ = json.Unmarshal(req.Params.Arguments, &args)
		actor, err := t.members.In(ctx, t.actor(req), args.Workspace)
		if err != nil {
			var none Out
			return nil, none, err
		}
		info := *req.Extra.TokenInfo
		info.Extra = map[string]any{actorKey: actor}
		req.Extra.TokenInfo = &info
		return handler(ctx, req, in)
	})
}

// addUnscopedTool registers a tool without the workspace argument: it acts
// across the person's workspaces, or in the default one as the app does.
func addUnscopedTool[In, Out any](server *mcp.Server, tool *mcp.Tool, handler mcp.ToolHandlerFor[In, Out]) {
	if tool.Meta == nil {
		tool.Meta = mcp.Meta{}
	}
	tool.Meta["securitySchemes"] = []map[string]any{{"type": "oauth2", "scopes": []string{}}}
	if tool.Annotations == nil {
		tool.Annotations = &mcp.ToolAnnotations{}
	}
	if tool.Annotations.DestructiveHint == nil {
		tool.Annotations.DestructiveHint = new(!tool.Annotations.ReadOnlyHint)
	}
	tool.Annotations.OpenWorldHint = new(false)
	mcp.AddTool(server, tool, handler)
}
