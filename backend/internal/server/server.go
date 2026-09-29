// Package server is the HTTP process shell: routing, auth, CORS and the web app.
package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"

	"github.com/charmbracelet/log"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/gql"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/mcpapi"
)

// WebDir holds the built web app; empty serves the API only.
type WebDir string

func New(keys *auth.Service, graphql *gql.Handler, agents *mcpapi.Handler, web WebDir, logger *log.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("/graphql", cors(authenticate(keys, graphql, logger)))
	mux.Handle("/mcp", cors(agents))
	if web != "" {
		mux.Handle("/", spa(string(web)))
	}
	return mux
}

// authenticate resolves the API key and answers failures in GraphQL's error shape.
func authenticate(keys *auth.Service, next http.Handler, logger *log.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, err := keys.Authenticate(r.Context(), r.Header.Get("Authorization"))
		if err != nil {
			status := http.StatusUnauthorized
			if !errors.Is(err, auth.ErrUnauthenticated) {
				logger.Error("authenticate", "error", err)
				status = http.StatusInternalServerError
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]any{"errors": []any{map[string]any{
				"message":    err.Error(),
				"extensions": map[string]any{"type": "authentication error", "code": "AUTHENTICATION_ERROR"},
			}}})
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithActor(r.Context(), actor)))
	})
}

// cors lets browser clients on other origins call the API: keys travel in a
// header, never in cookies, so any origin is safe.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// spa serves the built app, falling back to index.html for client routes.
func spa(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if info, err := os.Stat(filepath.Join(dir, filepath.Clean("/"+r.URL.Path))); err != nil || info.IsDir() {
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		files.ServeHTTP(w, r)
	})
}
