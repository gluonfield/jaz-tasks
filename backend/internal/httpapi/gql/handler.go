package gql

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/executor"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/charmbracelet/log"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

// Handler serves the Linear-compatible GraphQL API for an authenticated actor.
type Handler struct {
	tracker *tracker.Service
	server  *handler.Server
	exec    *executor.Executor
}

func NewHandler(svc *tracker.Service, logger *log.Logger) *Handler {
	schema := NewExecutableSchema(Config{Resolvers: Resolver{}})
	presenter := presentError(logger.WithPrefix("graphql"))
	srv := handler.New(schema)
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})
	srv.SetQueryCache(lru.New[*ast.QueryDocument](256))
	srv.Use(extension.Introspection{})
	srv.SetErrorPresenter(presenter)
	exec := executor.New(schema)
	exec.SetErrorPresenter(presenter)
	return &Handler{tracker: svc, server: srv, exec: exec}
}

// Request is one GraphQL operation as a client posts it; Variables stay raw
// so numbers decode exactly, as gqlgen's HTTP transport decodes them.
type Request struct {
	Query         string
	OperationName string
	Variables     json.RawMessage
}

// Execute runs an operation without HTTP, for callers such as the MCP App
// bridge that already authenticated the actor.
func (h *Handler) Execute(ctx context.Context, actor auth.Actor, req Request) *graphql.Response {
	ctx = graphql.StartOperationTrace(withScope(ctx, h.tracker.Scope(actor)))
	params := &graphql.RawParams{Query: req.Query, OperationName: req.OperationName}
	if len(req.Variables) > 0 {
		decoder := json.NewDecoder(bytes.NewReader(req.Variables))
		decoder.UseNumber()
		if err := decoder.Decode(&params.Variables); err != nil {
			return &graphql.Response{Errors: gqlerror.List{gqlerror.Errorf("variables must be a JSON object: %v", err)}}
		}
	}
	now := graphql.Now()
	params.ReadTime = graphql.TraceTiming{Start: now, End: now}
	op, errs := h.exec.CreateOperationContext(ctx, params)
	if errs != nil {
		return h.exec.DispatchError(graphql.WithOperationContext(ctx, op), errs)
	}
	respond, ctx := h.exec.DispatchOperation(ctx, op)
	return respond(ctx)
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	actor, ok := auth.ActorFrom(r.Context())
	if !ok {
		http.Error(w, auth.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		return
	}
	h.server.ServeHTTP(w, r.WithContext(withScope(r.Context(), h.tracker.Scope(actor))))
}

// presentError tags tracker errors the way Linear tags user errors.
func presentError(logger *log.Logger) graphql.ErrorPresenterFunc {
	return func(ctx context.Context, err error) *gqlerror.Error {
		presented := graphql.DefaultErrorPresenter(ctx, err)
		var notFound tracker.NotFoundError
		var invalid tracker.InvalidInputError
		switch {
		case errors.As(err, &notFound), errors.As(err, &invalid):
			presented.Extensions = map[string]any{
				"type":                   "invalid input",
				"code":                   "INPUT_ERROR",
				"userError":              true,
				"userPresentableMessage": presented.Message,
			}
		case errors.Unwrap(err) != nil:
			logger.Error("resolver failed", "path", presented.Path, "error", err)
		}
		return presented
	}
}
