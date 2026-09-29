// Package mcpapi exposes the tracker to agents as a Streamable HTTP MCP server.
package mcpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	mcpauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const instructions = `Jaz Tasks is a Linear-style issue tracker. Issues belong to teams (keys like ENG) and are
identified as ENG-123. Refer to teams, states, people, projects and labels by name; "me" is the
authenticated user. Call list_teams first to learn team keys, workflow states and labels.`

// Handler serves /mcp. Requests carry an OAuth access token or API key as a
// Bearer token; a 401 points clients at the protected-resource metadata.
type Handler struct {
	http.Handler
}

func NewHandler(svc *tracker.Service, keys *auth.Service) *Handler {
	server := mcp.NewServer(&mcp.Implementation{Name: "jaz-tasks", Title: "Jaz Tasks", Version: "0.1.0"}, &mcp.ServerOptions{Instructions: instructions})
	register(server, tools{svc: svc})
	verify := func(ctx context.Context, token string, _ *http.Request) (*mcpauth.TokenInfo, error) {
		actor, err := keys.Authenticate(ctx, token)
		if errors.Is(err, auth.ErrUnauthenticated) {
			return nil, mcpauth.ErrInvalidToken
		}
		if err != nil {
			return nil, err
		}
		return &mcpauth.TokenInfo{
			UserID:     actor.UserID,
			Expiration: time.Now().Add(time.Hour),
			Extra:      map[string]any{workspaceKey: actor.WorkspaceID},
		}, nil
	}
	streamable := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil)
	requireToken := mcpauth.RequireBearerToken(verify, &mcpauth.RequireBearerTokenOptions{ResourceMetadataURL: keys.ResourceMetadataURL("/mcp")})
	return &Handler{Handler: requireToken(streamable)}
}

const workspaceKey = "workspace"

type tools struct {
	svc *tracker.Service
}

// scope rebuilds the actor the bearer token resolved to for this request.
func (t tools) scope(req *mcp.CallToolRequest) *tracker.Scope {
	info := req.Extra.TokenInfo
	return t.svc.Scope(auth.Actor{UserID: info.UserID, WorkspaceID: info.Extra[workspaceKey].(string)})
}
