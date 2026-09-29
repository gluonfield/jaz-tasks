package app

import (
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/gql"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/mcpapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/server"
	"go.uber.org/fx"
)

func HTTPModule() fx.Option {
	return fx.Provide(
		gql.NewHandler,
		mcpapi.NewHandler,
		server.New,
	)
}
