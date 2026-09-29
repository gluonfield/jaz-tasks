package authapi

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
	mcpauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
)

func (h *Handler) routes() {
	h.mux.HandleFunc("GET /auth/config", h.config)
	h.mux.HandleFunc("GET /auth/login", h.login)
	h.mux.HandleFunc("GET /auth/callback", h.callback)
	h.mux.HandleFunc("POST /auth/dev-login", h.devSignIn)
	h.mux.HandleFunc("POST /auth/logout", h.logout)
	h.mux.HandleFunc("GET /auth/api-keys", h.listKeys)
	h.mux.HandleFunc("POST /auth/api-keys", h.createKey)
	h.mux.HandleFunc("DELETE /auth/api-keys/{id}", h.deleteKey)
	h.mux.HandleFunc("GET /auth/workspaces", h.listWorkspaces)
	h.mux.HandleFunc("POST /auth/workspace", h.switchWorkspace)
	h.mux.HandleFunc("GET /auth/invites", h.listInvites)
	h.mux.HandleFunc("POST /auth/invites", h.invite)
	h.mux.HandleFunc("DELETE /auth/invites/{id}", h.cancelInvite)
	h.mux.HandleFunc("GET /auth/grants", h.listGrants)
	h.mux.HandleFunc("DELETE /auth/grants/{id}", h.revokeGrant)

	h.mux.HandleFunc("GET /.well-known/oauth-authorization-server", h.serverMetadata)
	for _, path := range []string{"", "/mcp", "/graphql"} {
		h.mux.Handle("/.well-known/oauth-protected-resource"+path, mcpauth.ProtectedResourceMetadataHandler(&oauthex.ProtectedResourceMetadata{
			Resource:               h.svc.Issuer() + path,
			AuthorizationServers:   []string{h.svc.Issuer()},
			BearerMethodsSupported: []string{"header"},
			ResourceName:           "Jaz Tasks",
		}))
	}
	h.mux.HandleFunc("POST /oauth/register", h.register)
	h.mux.HandleFunc("GET /oauth/authorize", h.authorize)
	h.mux.HandleFunc("POST /oauth/authorize", h.decide)
	h.mux.HandleFunc("POST /oauth/token", h.token)
	h.mux.HandleFunc("POST /oauth/revoke", h.revoke)
}

func (h *Handler) config(w http.ResponseWriter, _ *http.Request) {
	out := map[string]any{"devLogin": h.devLogin}
	if h.oidc.Enabled() {
		out["provider"] = h.oidc.Name()
	}
	writeJSON(w, http.StatusOK, out)
}

// loginState rides in a short-lived cookie between /auth/login and the callback.
type loginState struct {
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
	ReturnTo string `json:"r"`
}

const loginCookie = "jt_login"

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if !h.oidc.Enabled() {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	state := loginState{State: random(), Nonce: random(), Verifier: random() + random(), ReturnTo: returnTo(r.URL.Query().Get("return_to"))}
	target, err := h.oidc.AuthURL(r.Context(), state.State, state.Nonce, state.Verifier)
	if err != nil {
		h.fail(w, err)
		return
	}
	raw, _ := json.Marshal(state)
	http.SetCookie(w, h.cookie(loginCookie, base64.RawURLEncoding.EncodeToString(raw), time.Now().Add(10*time.Minute)))
	http.Redirect(w, r, target, http.StatusFound)
}

func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	var state loginState
	cookie, err := r.Cookie(loginCookie)
	if err == nil {
		raw, _ := base64.RawURLEncoding.DecodeString(cookie.Value)
		err = json.Unmarshal(raw, &state)
	}
	http.SetCookie(w, h.cookie(loginCookie, "", time.Unix(0, 0)))
	query := r.URL.Query()
	if err != nil || state.State == "" || query.Get("state") != state.State {
		page(w, http.StatusBadRequest, "Sign-in expired", "Your sign-in took too long or was started in another browser. Please try again.", "/login")
		return
	}
	if reason := query.Get("error"); reason != "" {
		page(w, http.StatusUnauthorized, "Sign-in cancelled", "The identity provider reported: "+reason+".", "/login")
		return
	}
	identity, err := h.oidc.Exchange(r.Context(), query.Get("code"), state.Verifier, state.Nonce)
	if err != nil {
		h.logger.Warn("oidc exchange failed", "error", err)
		page(w, http.StatusUnauthorized, "Sign-in failed", "We could not verify your identity. Please try again.", "/login")
		return
	}
	user, err := h.members.SignIn(r.Context(), identity)
	if errors.Is(err, workspaces.ErrNotAllowed) || errors.Is(err, workspaces.ErrEmailUnverified) {
		page(w, http.StatusForbidden, "Access denied", identity.Email+": "+err.Error()+".", "/login")
		return
	}
	if err != nil {
		h.fail(w, err)
		return
	}
	if h.startSession(w, r, user) {
		http.Redirect(w, r, state.ReturnTo, http.StatusFound)
	}
}

func (h *Handler) devSignIn(w http.ResponseWriter, r *http.Request) {
	if !h.devLogin {
		http.NotFound(w, r)
		return
	}
	user, err := h.svc.DevUser(r.Context())
	if err != nil {
		h.fail(w, err)
		return
	}
	if h.startSession(w, r, user) {
		http.Redirect(w, r, returnTo(r.FormValue("return_to")), http.StatusSeeOther)
	}
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		if err := h.svc.EndSession(r.Context(), cookie.Value); err != nil {
			h.fail(w, err)
			return
		}
	}
	http.SetCookie(w, h.cookie(sessionCookie, "", time.Unix(0, 0)))
	w.WriteHeader(http.StatusNoContent)
}

type apiKeyView struct {
	ID        string    `json:"id"`
	Label     string    `json:"label"`
	Hint      string    `json:"hint"`
	CreatedAt time.Time `json:"createdAt"`
}

func keyView(k storage.APIKey) apiKeyView {
	return apiKeyView{ID: k.ID, Label: k.Label, Hint: k.Hint, CreatedAt: k.CreatedAt}
}

func (h *Handler) listKeys(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	keys, err := h.svc.APIKeys(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	out := []apiKeyView{}
	for _, k := range keys {
		out = append(out, keyView(k))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) createKey(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	var in struct {
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	key, record, err := h.svc.CreateKey(r.Context(), actor.UserID, in.Label, "")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"key": key, "apiKey": keyView(record)})
}

func (h *Handler) deleteKey(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	h.noContent(w, h.svc.DeleteKey(r.Context(), actor, r.PathValue("id")))
}

func (h *Handler) listGrants(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	grants, err := h.svc.Grants(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	type grantView struct {
		ID         string    `json:"id"`
		ClientName string    `json:"clientName"`
		CreatedAt  time.Time `json:"createdAt"`
		LastUsedAt time.Time `json:"lastUsedAt"`
	}
	out := []grantView{}
	for _, g := range grants {
		out = append(out, grantView(g))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) revokeGrant(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	h.noContent(w, h.svc.RevokeGrant(r.Context(), actor, r.PathValue("id")))
}

func (h *Handler) noContent(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, storage.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	case err != nil:
		h.fail(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handler) serverMetadata(w http.ResponseWriter, _ *http.Request) {
	issuer := h.svc.Issuer()
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer":                                         issuer,
		"authorization_endpoint":                         issuer + "/oauth/authorize",
		"token_endpoint":                                 issuer + "/oauth/token",
		"registration_endpoint":                          issuer + "/oauth/register",
		"revocation_endpoint":                            issuer + "/oauth/revoke",
		"response_types_supported":                       []string{"code"},
		"grant_types_supported":                          []string{"authorization_code", "refresh_token"},
		"code_challenge_methods_supported":               []string{"S256"},
		"token_endpoint_auth_methods_supported":          []string{"none"},
		"revocation_endpoint_auth_methods_supported":     []string{"none"},
		"authorization_response_iss_parameter_supported": true,
	})
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var meta oauthex.ClientRegistrationMetadata
	if err := json.NewDecoder(r.Body).Decode(&meta); err != nil {
		writeJSON(w, http.StatusBadRequest, auth.OAuthError{Code: "invalid_client_metadata", Description: "body must be JSON client metadata"})
		return
	}
	if meta.TokenEndpointAuthMethod != "" && meta.TokenEndpointAuthMethod != "none" {
		writeJSON(w, http.StatusBadRequest, auth.OAuthError{Code: "invalid_client_metadata", Description: "only public clients (token_endpoint_auth_method none) with PKCE are supported"})
		return
	}
	client, err := h.svc.RegisterClient(r.Context(), meta.ClientName, meta.RedirectURIs)
	var oauthErr auth.OAuthError
	if errors.As(err, &oauthErr) {
		writeJSON(w, http.StatusBadRequest, oauthErr)
		return
	}
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, &oauthex.ClientRegistrationResponse{
		ClientRegistrationMetadata: oauthex.ClientRegistrationMetadata{
			RedirectURIs:            client.RedirectURIs,
			TokenEndpointAuthMethod: "none",
			GrantTypes:              []string{"authorization_code", "refresh_token"},
			ResponseTypes:           []string{"code"},
			ClientName:              client.Name,
		},
		ClientID:         client.ID,
		ClientIDIssuedAt: client.CreatedAt,
	})
}

func authorizeRequest(v url.Values) auth.AuthorizeRequest {
	return auth.AuthorizeRequest{
		ResponseType:        v.Get("response_type"),
		ClientID:            v.Get("client_id"),
		RedirectURI:         v.Get("redirect_uri"),
		CodeChallenge:       v.Get("code_challenge"),
		CodeChallengeMethod: v.Get("code_challenge_method"),
		State:               v.Get("state"),
		Scope:               v.Get("scope"),
		Resource:            v.Get("resource"),
	}
}

// authorize shows the consent screen, sending anyone signed out to sign in first.
func (h *Handler) authorize(w http.ResponseWriter, r *http.Request) {
	req := authorizeRequest(r.URL.Query())
	client, err := h.svc.CheckAuthorize(r.Context(), req)
	if !h.authorizeError(w, r, req, err) {
		return
	}
	actor, err := h.Actor(r)
	if err != nil {
		http.Redirect(w, r, "/login?return_to="+url.QueryEscape(r.URL.RequestURI()), http.StatusFound)
		return
	}
	cookie, _ := r.Cookie(sessionCookie)
	consent(w, h.svc, r, client, req, actor, csrf(cookie))
}

func (h *Handler) decide(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid form", http.StatusBadRequest)
		return
	}
	req := authorizeRequest(r.PostForm)
	_, err := h.svc.CheckAuthorize(r.Context(), req)
	if !h.authorizeError(w, r, req, err) {
		return
	}
	cookie, _ := r.Cookie(sessionCookie)
	actor, err := h.Actor(r)
	if err != nil || cookie == nil || r.PostForm.Get("csrf") != csrf(cookie) {
		page(w, http.StatusForbidden, "Authorization expired", "Please return to the application and start again.", "/")
		return
	}
	if r.PostForm.Get("decision") != "allow" {
		http.Redirect(w, r, h.svc.Redirect(req, url.Values{"error": {"access_denied"}}), http.StatusSeeOther)
		return
	}
	target, err := h.svc.Approve(r.Context(), actor, req)
	if err != nil {
		h.fail(w, err)
		return
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}

// authorizeError reports whether the request may proceed, answering otherwise.
func (h *Handler) authorizeError(w http.ResponseWriter, r *http.Request, req auth.AuthorizeRequest, err error) bool {
	var oauthErr auth.OAuthError
	switch {
	case err == nil:
		return true
	case errors.Is(err, auth.ErrBadRedirect):
		page(w, http.StatusBadRequest, "Unknown application", "This authorization request comes from an unregistered application or redirect address.", "/")
	case errors.As(err, &oauthErr):
		http.Redirect(w, r, h.svc.Redirect(req, url.Values{"error": {oauthErr.Code}, "error_description": {oauthErr.Description}}), http.StatusFound)
	default:
		h.fail(w, err)
	}
	return false
}

func (h *Handler) token(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, auth.OAuthError{Code: "invalid_request", Description: "body must be form encoded"})
		return
	}
	f := r.PostForm
	res, err := h.svc.Token(r.Context(), auth.TokenRequest{
		GrantType:    f.Get("grant_type"),
		ClientID:     f.Get("client_id"),
		Code:         f.Get("code"),
		RedirectURI:  f.Get("redirect_uri"),
		CodeVerifier: f.Get("code_verifier"),
		RefreshToken: f.Get("refresh_token"),
	})
	var oauthErr auth.OAuthError
	switch {
	case errors.As(err, &oauthErr):
		writeJSON(w, http.StatusBadRequest, oauthErr)
	case err != nil:
		h.fail(w, err)
	default:
		writeJSON(w, http.StatusOK, res)
	}
}

func (h *Handler) revoke(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Revoke(r.Context(), r.FormValue("token")); err != nil {
		h.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	memberships, err := h.members.Memberships(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	type workspaceView struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		URLKey  string `json:"urlKey"`
		Current bool   `json:"current"`
	}
	out := []workspaceView{}
	for _, m := range memberships {
		out = append(out, workspaceView{ID: m.WorkspaceID, Name: m.Name, URLKey: m.URLKey, Current: m.UserID == actor.UserID})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) switchWorkspace(w http.ResponseWriter, r *http.Request) {
	actor, token, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	var in struct {
		WorkspaceID string `json:"workspaceId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	user, err := h.members.Switch(r.Context(), actor, in.WorkspaceID)
	if errors.Is(err, workspaces.ErrNotMember) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	if err == nil {
		err = h.svc.SwitchSession(r.Context(), token, user.ID)
	}
	h.noContent(w, err)
}

type inviteView struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"createdAt"`
}

func (h *Handler) listInvites(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	invites, err := h.members.Invites(r.Context(), actor)
	if err != nil {
		h.fail(w, err)
		return
	}
	out := []inviteView{}
	for _, i := range invites {
		out = append(out, inviteView{ID: i.ID, Email: i.Email, CreatedAt: i.CreatedAt})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) invite(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	invite, err := h.members.Invite(r.Context(), actor, in.Email)
	switch {
	case errors.Is(err, workspaces.ErrForbidden):
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
	case err != nil:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	default:
		writeJSON(w, http.StatusCreated, inviteView{ID: invite.ID, Email: invite.Email, CreatedAt: invite.CreatedAt})
	}
}

func (h *Handler) cancelInvite(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := h.sessionActor(w, r)
	if !ok {
		return
	}
	err := h.members.CancelInvite(r.Context(), actor, r.PathValue("id"))
	if errors.Is(err, workspaces.ErrForbidden) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	h.noContent(w, err)
}
