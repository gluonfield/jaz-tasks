package signin

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
)

type Handler struct {
	cfg    Config
	app    string
	cookie string
	origin string
	oidc   *OIDC
	finish func(http.ResponseWriter, *http.Request, Identity) bool
	mux    *http.ServeMux
}

func NewHandler(cfg Config, appName, cookieName string, finish func(http.ResponseWriter, *http.Request, Identity) bool) (*Handler, error) {
	if cfg.Provider == "" {
		cfg.Provider = "oidc"
	}
	public, err := url.Parse(cfg.PublicURL)
	if err != nil || public.Host == "" || (public.Scheme != "http" && public.Scheme != "https") {
		return nil, fmt.Errorf("invalid sign-in public URL")
	}
	h := &Handler{cfg: cfg, app: appName, cookie: cookieName, origin: public.Scheme + "://" + public.Host, oidc: NewOIDC(cfg.OIDC), finish: finish, mux: http.NewServeMux()}
	h.mux.HandleFunc("GET /login", h.page)
	h.mux.HandleFunc("GET /auth/config", h.config)
	switch cfg.Provider {
	case "oidc":
		h.mux.HandleFunc("GET /auth/login", h.login)
		h.mux.HandleFunc("GET /auth/callback", h.callback)
	case "firebase":
		if cfg.Firebase.ProjectID == "" || cfg.Firebase.APIKey == "" || cfg.Firebase.AuthDomain == "" || cfg.Firebase.AppID == "" {
			return nil, fmt.Errorf("Firebase sign-in needs projectId, apiKey, authDomain and appId in FIREBASE_CONFIG")
		}
		firebase := NewFirebase(cfg.Firebase.ProjectID)
		h.mux.HandleFunc("GET /auth/login", h.page)
		h.mux.HandleFunc("POST /auth/firebase", func(w http.ResponseWriter, r *http.Request) {
			h.firebase(w, r, firebase)
		})
	default:
		return nil, fmt.Errorf("AUTH_PROVIDER must be oidc or firebase")
	}
	return h, nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Frame-Options", "DENY")
	h.mux.ServeHTTP(w, r)
}

func (h *Handler) config(w http.ResponseWriter, _ *http.Request) {
	out := map[string]any{"mode": h.cfg.Provider}
	if h.cfg.Provider == "firebase" {
		out["provider"] = "Google"
		out["firebase"] = h.cfg.Firebase
	} else if h.oidc.Enabled() {
		out["provider"] = h.oidc.Name()
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

type loginState struct {
	State    string `json:"s"`
	Nonce    string `json:"n,omitempty"`
	Verifier string `json:"v,omitempty"`
	ReturnTo string `json:"r"`
	Expires  int64  `json:"e"`
}

func (h *Handler) setState(w http.ResponseWriter, state loginState) {
	raw, _ := json.Marshal(state)
	http.SetCookie(w, h.stateCookie(base64.RawURLEncoding.EncodeToString(raw), time.Unix(state.Expires, 0)))
}

func (h *Handler) stateCookie(value string, expires time.Time) *http.Cookie {
	return &http.Cookie{Name: h.cookie, Value: value, Path: "/", HttpOnly: true, Secure: strings.HasPrefix(h.origin, "https://"), SameSite: http.SameSiteLaxMode, Expires: expires}
}

func (h *Handler) readState(r *http.Request, token string) (loginState, bool) {
	var state loginState
	cookie, err := r.Cookie(h.cookie)
	if err == nil {
		raw, _ := base64.RawURLEncoding.DecodeString(cookie.Value)
		err = json.Unmarshal(raw, &state)
	}
	return state, err == nil && state.State != "" && state.Expires > time.Now().Unix() && subtle.ConstantTimeCompare([]byte(token), []byte(state.State)) == 1
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if !h.oidc.Enabled() {
		h.page(w, r)
		return
	}
	state := loginState{State: rand.Text(), Nonce: rand.Text(), Verifier: rand.Text() + rand.Text(), ReturnTo: returnTo(r.URL.Query().Get("return_to")), Expires: time.Now().Add(10 * time.Minute).Unix()}
	target, err := h.oidc.AuthURL(r.Context(), state.State, state.Nonce, state.Verifier)
	if err != nil {
		slog.ErrorContext(r.Context(), "discover sign-in provider", "error", err)
		http.Error(w, "Sign-in is temporarily unavailable. Please try again.", http.StatusBadGateway)
		return
	}
	h.setState(w, state)
	http.Redirect(w, r, target, http.StatusFound)
}

func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	state, ok := h.readState(r, r.URL.Query().Get("state"))
	http.SetCookie(w, h.stateCookie("", time.Unix(0, 0)))
	if !ok {
		http.Error(w, "Sign-in expired. Please try again.", http.StatusBadRequest)
		return
	}
	if r.URL.Query().Get("error") != "" {
		http.Error(w, "Sign-in cancelled. Please try again.", http.StatusUnauthorized)
		return
	}
	id, err := h.oidc.Exchange(r.Context(), r.URL.Query().Get("code"), state.Verifier, state.Nonce)
	if err != nil {
		slog.WarnContext(r.Context(), "verify OIDC sign-in", "error", err)
		http.Error(w, "Could not verify your identity. Please try again.", http.StatusUnauthorized)
		return
	}
	if h.finish(w, r, id) {
		http.Redirect(w, r, returnTo(state.ReturnTo), http.StatusFound)
	}
}

func (h *Handler) firebase(w http.ResponseWriter, r *http.Request, firebase *Firebase) {
	media, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if media != "application/json" {
		http.Error(w, "send application/json", http.StatusUnsupportedMediaType)
		return
	}
	if r.Header.Get("Origin") != h.origin {
		http.Error(w, "sign-in must start on this site", http.StatusForbidden)
		return
	}
	state, ok := h.readState(r, r.Header.Get("X-CSRF-Token"))
	if !ok {
		http.Error(w, "Sign-in expired. Please try again.", http.StatusForbidden)
		return
	}
	var in struct {
		IDToken string `json:"idToken"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in); err != nil {
		http.Error(w, "invalid sign-in request", http.StatusBadRequest)
		return
	}
	id, err := firebase.Verify(r.Context(), strings.TrimSpace(in.IDToken))
	if err != nil {
		slog.WarnContext(r.Context(), "verify Firebase sign-in", "error", err)
		http.Error(w, "Could not verify your identity. Please try again.", http.StatusUnauthorized)
		return
	}
	if h.finish(w, r, id) {
		http.SetCookie(w, h.stateCookie("", time.Unix(0, 0)))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"redirect": returnTo(state.ReturnTo)})
	}
}

func returnTo(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "" || u.Host != "" || !strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") ||
		strings.ContainsFunc(raw, func(r rune) bool { return r == '\\' || unicode.IsControl(r) }) {
		return "/"
	}
	return raw
}
