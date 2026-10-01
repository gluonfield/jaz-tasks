// Package mcpapi exposes the tracker to agents as a Streamable HTTP MCP server.
package mcpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/gql"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
	mcpauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const instructions = `Jaz Tasks is a Linear-style issue tracker. Issues belong to teams (keys like ENG) and are
identified as ENG-123. Refer to teams, states, people, projects and labels by name; "me" is the
authenticated user. Call list_teams first to learn team keys, workflow states and labels. Tools act
in your default workspace; to work in another, pass its name as the workspace argument (list_workspaces).`

// Handler serves /mcp. Requests carry an OAuth access token or API key as a
// Bearer token; a 401 points clients at the protected-resource metadata.
type Handler struct {
	http.Handler
}

func NewHandler(svc *tracker.Service, members *workspaces.Service, keys *auth.Service, graphql *gql.Handler) *Handler {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "jaz-tasks",
		Title:   "Jaz Tasks",
		Version: "0.1.0",
		Icons:   icons,
	}, &mcp.ServerOptions{Instructions: instructions})
	t := tools{svc: svc, members: members, graphql: graphql}
	register(server, t)
	registerApp(server, t, keys.Issuer())
	registerProfile(server, keys, t)
	registerWorkspaces(server, t)
	verify := func(ctx context.Context, token string, _ *http.Request) (*mcpauth.TokenInfo, error) {
		actor, err := keys.Authenticate(ctx, token)
		if errors.Is(err, auth.ErrUnauthenticated) {
			return nil, mcpauth.ErrInvalidToken
		}
		if err != nil {
			return nil, err
		}
		// The SDK binds a session to UserID, so it must survive switching
		// workspace; tools read the actor itself from Extra.
		return &mcpauth.TokenInfo{
			UserID:     actor.Principal(),
			Expiration: time.Now().Add(time.Hour),
			Extra:      map[string]any{actorKey: actor},
		}, nil
	}
	streamable := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil)
	requireToken := mcpauth.RequireBearerToken(verify, &mcpauth.RequireBearerTokenOptions{ResourceMetadataURL: keys.ResourceMetadataURL("/mcp")})
	return &Handler{Handler: requireToken(streamable)}
}

const actorKey = "actor"

type tools struct {
	svc     *tracker.Service
	members *workspaces.Service
	graphql *gql.Handler
}

// actor is who the bearer token resolved to for this request, credential
// included, so the app can switch the connection's workspace.
func (t tools) actor(req *mcp.CallToolRequest) auth.Actor {
	return req.Extra.TokenInfo.Extra[actorKey].(auth.Actor)
}

func (t tools) scope(req *mcp.CallToolRequest) *tracker.Scope {
	return t.svc.Scope(t.actor(req))
}
