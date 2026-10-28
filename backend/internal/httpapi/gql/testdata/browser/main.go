package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"

	"github.com/charmbracelet/log"
	signin "github.com/gluonfield/jaz-tasks/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/authapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/gql"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/mcpapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/seed"
	"github.com/gluonfield/jaz-tasks/backend/internal/server"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
	"github.com/jackc/pgx/v5"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	ctx := context.Background()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		base = postgrestest.DefaultURL
	}
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		return err
	}
	defer admin.Close(ctx)
	name := "shortcuts_" + strings.ToLower(rand.Text())
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		return err
	}
	defer admin.Exec(ctx, "DROP DATABASE "+name+" WITH (FORCE)")
	u, err := url.Parse(base)
	if err != nil {
		return err
	}
	u.Path = "/" + name
	store, err := postgres.Open(ctx, u.String())
	if err != nil {
		return err
	}
	defer store.Close()
	srv := httptest.NewUnstartedServer(nil)
	origin := "http://" + srv.Listener.Addr().String()
	keys := auth.NewService(store, auth.Config{PublicURL: origin})
	trackerService := tracker.NewService(store, tracker.PublicURL(origin))
	seeded, _, err := seed.Run(ctx, store, keys, trackerService)
	if err != nil {
		return err
	}
	if err := seedDateIssues(ctx, store, trackerService.Scope(seeded.Actor)); err != nil {
		return err
	}
	people := workspaces.NewService(store, workspaces.Config{})
	logger := log.New(io.Discard)
	authn, err := authapi.NewHandler(keys, people, signin.Config{PublicURL: origin}, logger)
	if err != nil {
		return err
	}
	graphql := gql.NewHandler(trackerService, people, keys, logger)
	srv.Config.Handler = server.New(authn, graphql, mcpapi.NewHandler(trackerService, people, keys, graphql), server.WebDir(os.Getenv("SHORTCUT_WEB_DIR")), logger)
	srv.Start()
	defer srv.Close()
	token, _, err := keys.CreateSession(ctx, seeded.Actor.UserID)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]string{"url": origin, "session": token}); err != nil {
		return err
	}
	_, err = io.Copy(io.Discard, os.Stdin)
	return err
}
