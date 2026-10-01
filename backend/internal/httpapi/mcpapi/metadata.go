package mcpapi

import "github.com/modelcontextprotocol/go-sdk/mcp"

func addTool[In, Out any](server *mcp.Server, tool *mcp.Tool, handler mcp.ToolHandlerFor[In, Out]) {
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
