// Package app wires the process: configuration, storage, services and HTTP.
package app

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/log"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/authapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/seed"
	"github.com/gluonfield/jaz-tasks/backend/internal/server"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
	"go.uber.org/fx"
)

type Config struct {
	Addr        string
	DatabaseURL string
	PublicURL   string
	WebDir      string
	SeedAPIKey  string
	OIDC        auth.OIDCConfig
	Auth        auth.Config
	Workspaces  workspaces.Config
	DevLogin    authapi.DevLogin
}

// ParseConfig reads flags, each defaulting to an environment variable, and
// the auth settings, which come from the environment only.
func ParseConfig(args []string) (Config, error) {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	cfg := Config{}
	fs.StringVar(&cfg.Addr, "addr", env("ADDR", ":7400"), "HTTP listen address (ADDR)")
	fs.StringVar(&cfg.DatabaseURL, "database-url", env("DATABASE_URL", "postgres://jaztasks:jaztasks@localhost:55432/jaztasks?sslmode=disable"), "Postgres URL (DATABASE_URL)")
	fs.StringVar(&cfg.PublicURL, "public-url", env("PUBLIC_URL", "http://localhost:7400"), "URL the web app is reachable at (PUBLIC_URL)")
	fs.StringVar(&cfg.WebDir, "web-dir", env("WEB_DIR", ""), "directory of the built web app (WEB_DIR)")
	if err := fs.Parse(args); err != nil {
		return cfg, err
	}
	cfg.PublicURL = strings.TrimRight(strings.TrimSpace(cfg.PublicURL), "/")
	cfg.SeedAPIKey = strings.TrimSpace(os.Getenv("SEED_API_KEY"))
	cfg.OIDC = auth.OIDCConfig{
		Issuer:       strings.TrimSpace(os.Getenv("OIDC_ISSUER")),
		ClientID:     strings.TrimSpace(os.Getenv("OIDC_CLIENT_ID")),
		ClientSecret: strings.TrimSpace(os.Getenv("OIDC_CLIENT_SECRET")),
		RedirectURL:  cfg.PublicURL + "/auth/callback",
	}
	cfg.Auth = auth.Config{PublicURL: cfg.PublicURL}
	cfg.Workspaces = workspaces.Config{
		AllowedEmailDomains: list(os.Getenv("ALLOWED_EMAIL_DOMAINS")),
		AllowedEmails:       list(os.Getenv("ALLOWED_EMAILS")),
	}
	cfg.DevLogin = os.Getenv("DEV_LOGIN") == "1"
	return cfg, nil
}

func list(raw string) []string {
	var out []string
	for _, item := range strings.Split(raw, ",") {
		if item = strings.TrimSpace(item); item != "" {
			out = append(out, item)
		}
	}
	return out
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func Options(cfg Config) fx.Option {
	return fx.Options(
		fx.Supply(cfg, cfg.Auth, cfg.Workspaces, cfg.OIDC, cfg.DevLogin, tracker.PublicURL(cfg.PublicURL), server.WebDir(cfg.WebDir)),
		fx.Provide(
			NewLogger,
			fx.Annotate(OpenStore, fx.As(fx.Self()), fx.As(new(storage.TrackerStore)), fx.As(new(storage.AuthStore)), fx.As(new(storage.WorkspaceStore))),
			auth.NewService,
			workspaces.NewService,
			auth.NewOIDC,
			tracker.NewService,
		),
		HTTPModule(),
		fx.Invoke(Seed, StartHTTP),
	)
}

func NewLogger() *log.Logger {
	level, err := log.ParseLevel(env("LOG_LEVEL", "info"))
	if err != nil {
		level = log.InfoLevel
	}
	return log.NewWithOptions(os.Stderr, log.Options{ReportTimestamp: true, Level: level})
}

func OpenStore(lc fx.Lifecycle, cfg Config) (*postgres.Store, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, err := postgres.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	lc.Append(fx.StopHook(store.Close))
	return store, nil
}

// Seed creates the demo workspace on an empty database for development
// login and tests; real sign-ins always get workspaces of their own.
func Seed(store storage.TrackerStore, keys *auth.Service, svc *tracker.Service, oidc *auth.OIDC, cfg Config, logger *log.Logger) error {
	if !bool(cfg.DevLogin) || oidc.Enabled() {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	result, seeded, err := seed.Run(ctx, store, keys, svc, cfg.SeedAPIKey)
	if err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	if seeded {
		logger.Info("seeded demo workspace", "api_key", result.APIKey)
	}
	return nil
}

func StartHTTP(lc fx.Lifecycle, handler http.Handler, cfg Config, logger *log.Logger) {
	srv := &http.Server{Addr: cfg.Addr, Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			listener, err := net.Listen("tcp", cfg.Addr)
			if err != nil {
				return err
			}
			logger.Info("jaz tasks listening", "addr", cfg.Addr, "url", cfg.PublicURL)
			go func() {
				if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
					logger.Error("serve", "error", err)
				}
			}()
			return nil
		},
		OnStop: srv.Shutdown,
	})
}

// MintAPIKey opens the database directly to issue a key outside the server.
func MintAPIKey(ctx context.Context, cfg Config, email string) (string, error) {
	store, err := postgres.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return "", err
	}
	defer store.Close()
	return auth.NewService(store, cfg.Auth).CreateKeyForEmail(ctx, email)
}
