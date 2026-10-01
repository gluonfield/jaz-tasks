package mcpapi

import (
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// addTool registers a tool that acts in one workspace: the one its optional
// workspace argument names, else the connection's default.
func addTool[In, Out any](server *mcp.Server, tool *mcp.Tool, handler mcp.ToolHandlerFor[In, Out]) {
	schema, err := jsonschema.For[In](nil)
	if err != nil {
		panic(err)
	}
	if schema.Properties == nil {
		schema.Properties = map[string]*jsonschema.Schema{}
	}
	schema.Properties["workspace"] = &jsonschema.Schema{Type: "string", Description: "name of the workspace to act in; omit for the default one (list_workspaces)"}
	tool.InputSchema = schema
	addUnscopedTool(server, tool, handler)
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
