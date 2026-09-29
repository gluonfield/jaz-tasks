// Package authapi serves sign-in, the OAuth 2.1 authorization server and
// the settings endpoints for API keys and authorized applications.
package authapi

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/charmbracelet/log"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
)

const sessionCookie = "jt_session"

// DevLogin enables one-click sign-in as the seeded owner when no OIDC
// provider is configured; startup fails if PUBLIC_URL is not loopback.
type DevLogin bool

type Handler struct {
	svc      *auth.Service
	members  *workspaces.Service
	oidc     *auth.OIDC
	devLogin bool
	public   *url.URL
	logger   *log.Logger
	mux      *http.ServeMux
}

func NewHandler(svc *auth.Service, members *workspaces.Service, oidc *auth.OIDC, devLogin DevLogin, logger *log.Logger) (*Handler, error) {
	public, err := url.Parse(svc.Issuer())
	if err != nil {
		return nil, err
	}
	enabled := bool(devLogin) && !oidc.Enabled()
	switch {
	case bool(devLogin) && oidc.Enabled():
		logger.Warn("DEV_LOGIN is ignored because OIDC is configured")
	case enabled && !loopback(public.Hostname()):
		return nil, errors.New("DEV_LOGIN=1 only works with a localhost PUBLIC_URL; configure OIDC and unset DEV_LOGIN for " + public.Host)
	case enabled:
		logger.Warn("DEV_LOGIN is on: anyone who can reach this server signs in as the seeded owner. Never enable it in production.")
	}
	h := &Handler{svc: svc, members: members, oidc: oidc, devLogin: enabled, public: public, logger: logger.WithPrefix("auth"), mux: http.NewServeMux()}
	h.routes()
	return h, nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func loopback(host string) bool {
	ip := net.ParseIP(host)
	return host == "localhost" || ip != nil && ip.IsLoopback()
}

// Actor authenticates a request by its Authorization header, falling back to
// the session cookie a signed-in browser carries.
func (h *Handler) Actor(r *http.Request) (auth.Actor, error) {
	if header := r.Header.Get("Authorization"); header != "" {
		return h.svc.Authenticate(r.Context(), header)
	}
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return auth.Actor{}, auth.ErrUnauthenticated
	}
	return h.svc.Session(r.Context(), cookie.Value)
}

// ResourceMetadataURL is where a 401 for path points clients (RFC 9728).
func (h *Handler) ResourceMetadataURL(path string) string {
	return h.svc.ResourceMetadataURL(path)
}

func (h *Handler) cookie(name, value string, expires time.Time) *http.Cookie {
	c := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.public.Scheme == "https",
	}
	if !loopback(h.public.Hostname()) {
		c.Domain = h.public.Hostname()
	}
	return c
}

func (h *Handler) startSession(w http.ResponseWriter, r *http.Request, user storage.User) bool {
	token, expires, err := h.svc.CreateSession(r.Context(), user.ID)
	if err != nil {
		h.fail(w, err)
		return false
	}
	http.SetCookie(w, h.cookie(sessionCookie, token, expires))
	return true
}

// sessionActor requires a browser session; bearer tokens cannot manage keys.
func (h *Handler) sessionActor(w http.ResponseWriter, r *http.Request) (auth.Actor, string, bool) {
	cookie, err := r.Cookie(sessionCookie)
	if err == nil {
		if actor, err := h.svc.Session(r.Context(), cookie.Value); err == nil {
			return actor, cookie.Value, true
		}
	}
	writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "sign in required"})
	return auth.Actor{}, "", false
}

func (h *Handler) fail(w http.ResponseWriter, err error) {
	h.logger.Error("request failed", "error", err)
	http.Error(w, "internal error", http.StatusInternalServerError)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// returnTo keeps post-login redirects on this site.
func returnTo(raw string) string {
	if !strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") || strings.HasPrefix(raw, "/\\") {
		return "/"
	}
	return raw
}

func random() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
