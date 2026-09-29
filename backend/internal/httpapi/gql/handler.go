package gql

import (
	"context"
	"errors"
	"net/http"

	"github.com/99designs/gqlgen/graphql"
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
}

func NewHandler(svc *tracker.Service, logger *log.Logger) *Handler {
	srv := handler.New(NewExecutableSchema(Config{Resolvers: Resolver{}}))
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})
	srv.SetQueryCache(lru.New[*ast.QueryDocument](256))
	srv.Use(extension.Introspection{})
	srv.SetErrorPresenter(presentError(logger.WithPrefix("graphql")))
	return &Handler{tracker: svc, server: srv}
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
