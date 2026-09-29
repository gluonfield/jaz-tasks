package authapi_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

// issuer is a fake OpenID provider: discovery, JWKS and a token endpoint
// that signs whatever identity the test queued for the next code.
type issuer struct {
	*httptest.Server
	key    *rsa.PrivateKey
	claims map[string]map[string]any
}

func newIssuer(t *testing.T) *issuer {
	t.Helper()
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	iss := &issuer{key: key, claims: map[string]map[string]any{}}
	mux := http.NewServeMux()
	iss.Server = httptest.NewServer(mux)
	t.Cleanup(iss.Close)
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                                iss.URL,
			"authorization_endpoint":                iss.URL + "/authorize",
			"token_endpoint":                        iss.URL + "/token",
			"jwks_uri":                              iss.URL + "/jwks",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		claims := iss.claims[r.FormValue("code")]
		if claims == nil || r.FormValue("code_verifier") == "" {
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
			return
		}
		signer, _ := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "k1"))
		token, _ := jwt.Signed(signer).Claims(claims).Serialize()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "at", "token_type": "Bearer", "id_token": token, "expires_in": 3600})
	})
	return iss
}

// signIn walks a browser through /auth/login, the provider and the callback
// as the given person, returning the callback response.
func (iss *issuer) signIn(t *testing.T, s stack, b *http.Client, email string, verified bool) *http.Response {
	t.Helper()
	res, err := b.Get(s.url + "/auth/login?return_to=/team/ENG/all")
	if err != nil || res.StatusCode != http.StatusFound {
		t.Fatalf("login: %v %v", res.StatusCode, err)
	}
	res.Body.Close()
	authorize, _ := url.Parse(res.Header.Get("Location"))
	q := authorize.Query()
	if !strings.HasPrefix(authorize.String(), iss.URL+"/authorize") || q.Get("redirect_uri") != s.url+"/auth/callback" || q.Get("code_challenge_method") != "S256" {
		t.Fatalf("provider redirect: %s", authorize)
	}
	code := "code-" + email
	iss.claims[code] = map[string]any{
		"iss": iss.URL, "sub": "sub-" + email, "aud": "client-1", "nonce": q.Get("nonce"),
		"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(),
		"email": email, "email_verified": verified, "name": "Casey " + strings.Split(email, "@")[0], "picture": "https://img.test/a.png",
	}
	res, err = b.Get(s.url + "/auth/callback?" + url.Values{"code": {code}, "state": {q.Get("state")}}.Encode())
	if err != nil {
		t.Fatal(err)
	}
	return res
}

type me struct {
	Email        string
	Admin        bool
	Organization string
	Teams        []string
	Issues       int
}

// viewer reads who the browser acts as and what its workspace holds.
func viewer(t *testing.T, s stack, b *http.Client) me {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, s.url+"/graphql", strings.NewReader(`{"query":"{ viewer { email admin } organization { id } teams { nodes { key } } issues { nodes { id } } }"}`))
	req.Header.Set("Content-Type", "application/json")
	res, err := b.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out struct {
		Data struct {
			Viewer struct {
				Email string `json:"email"`
				Admin bool   `json:"admin"`
			} `json:"viewer"`
			Organization struct {
				ID string `json:"id"`
			} `json:"organization"`
			Teams  struct{ Nodes []struct{ Key string } } `json:"teams"`
			Issues struct{ Nodes []struct{ ID string } }  `json:"issues"`
		} `json:"data"`
	}
	_ = json.NewDecoder(res.Body).Decode(&out)
	m := me{Email: out.Data.Viewer.Email, Admin: out.Data.Viewer.Admin, Organization: out.Data.Organization.ID, Issues: len(out.Data.Issues.Nodes)}
	for _, team := range out.Data.Teams.Nodes {
		m.Teams = append(m.Teams, team.Key)
	}
	return m
}

func session(t *testing.T, s stack, b *http.Client, method, path, body string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(method, s.url+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res, err := b.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(out)
}

// Anyone with a verified email signs up into a workspace of their own; the
// demo workspace is never where a real sign-in lands.
func TestOIDCSignUpGivesEachPersonAWorkspace(t *testing.T) {
	iss := newIssuer(t)
	s := start(t, auth.OIDCConfig{Issuer: iss.URL, ClientID: "client-1", ClientSecret: "secret"}, workspaces.Config{}, false)

	ada := browser()
	res := iss.signIn(t, s, ada, "ada@example.com", true)
	res.Body.Close()
	if res.StatusCode != http.StatusFound || res.Header.Get("Location") != "/team/ENG/all" {
		t.Fatalf("sign-in: %d %s", res.StatusCode, res.Header.Get("Location"))
	}
	first := viewer(t, s, ada)
	if first.Email != "ada@example.com" || !first.Admin || len(first.Teams) != 1 || first.Teams[0] != "CAS" || first.Issues != 0 {
		t.Fatalf("new workspace: %+v", first)
	}

	grace := browser()
	res = iss.signIn(t, s, grace, "grace@example.com", true)
	res.Body.Close()
	second := viewer(t, s, grace)
	if !second.Admin || second.Organization == first.Organization {
		t.Fatalf("second person must get another workspace: %+v vs %+v", second, first)
	}

	demo := browser()
	res = iss.signIn(t, s, demo, "sofia@jaz.local", true)
	res.Body.Close()
	if got := viewer(t, s, demo); got.Issues != 0 || got.Organization == "" {
		t.Fatalf("a seeded email must not reach the demo workspace: %+v", got)
	}

	again := browser()
	res = iss.signIn(t, s, again, "ada@example.com", true)
	res.Body.Close()
	if got := viewer(t, s, again); got.Organization != first.Organization {
		t.Fatalf("returning person lands elsewhere: %+v", got)
	}

	res = iss.signIn(t, s, browser(), "eve@example.com", false)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("unverified email: %d", res.StatusCode)
	}

	if status, _ := session(t, s, ada, http.MethodPost, "/auth/logout", ""); status != http.StatusNoContent {
		t.Fatalf("logout: %d", status)
	}
	if got := viewer(t, s, ada); got.Email != "" {
		t.Fatalf("session survived logout: %+v", got)
	}
	if res, _ := http.PostForm(s.url+"/auth/dev-login", nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("dev login must be off with OIDC: %d", res.StatusCode)
	}
}

func TestOIDCSignInAllowlist(t *testing.T) {
	iss := newIssuer(t)
	s := start(t, auth.OIDCConfig{Issuer: iss.URL, ClientID: "client-1"}, workspaces.Config{AllowedEmailDomains: []string{"ml.ink"}, AllowedEmails: []string{"guest@example.com"}}, false)
	for email, allowed := range map[string]bool{"ana@ml.ink": true, "guest@example.com": true, "other@example.com": false} {
		b := browser()
		res := iss.signIn(t, s, b, email, true)
		res.Body.Close()
		if got := viewer(t, s, b); allowed != (got.Email == email) {
			t.Errorf("%s: status %d, viewer %+v", email, res.StatusCode, got)
		}
	}
}

// Invites are the only way into someone else's workspace: new people land
// in the inviting workspace, signed-in people see it in their switcher.
func TestInvitesAndSwitching(t *testing.T) {
	iss := newIssuer(t)
	s := start(t, auth.OIDCConfig{Issuer: iss.URL, ClientID: "client-1"}, workspaces.Config{}, false)
	owner := browser()
	iss.signIn(t, s, owner, "owner@example.com", true).Body.Close()
	home := viewer(t, s, owner)

	if status, body := session(t, s, owner, http.MethodPost, "/auth/invites", `{"email":"Bob@Example.com"}`); status != http.StatusCreated || !strings.Contains(body, "bob@example.com") {
		t.Fatalf("invite: %d %s", status, body)
	}
	bob := browser()
	iss.signIn(t, s, bob, "bob@example.com", true).Body.Close()
	if got := viewer(t, s, bob); got.Organization != home.Organization || got.Admin {
		t.Fatalf("invited person should join as a member: %+v", got)
	}
	if status, _ := session(t, s, bob, http.MethodPost, "/auth/invites", `{"email":"x@example.com"}`); status != http.StatusForbidden {
		t.Fatalf("members cannot invite: %d", status)
	}

	carol := browser()
	iss.signIn(t, s, carol, "carol@example.com", true).Body.Close()
	own := viewer(t, s, carol)
	session(t, s, owner, http.MethodPost, "/auth/invites", `{"email":"carol@example.com"}`)
	status, body := session(t, s, carol, http.MethodGet, "/auth/workspaces", "")
	var list []struct {
		ID      string `json:"id"`
		Current bool   `json:"current"`
	}
	_ = json.Unmarshal([]byte(body), &list)
	if status != http.StatusOK || len(list) != 2 {
		t.Fatalf("workspaces: %d %s", status, body)
	}
	if status, _ := session(t, s, carol, http.MethodPost, "/auth/workspace", `{"workspaceId":"`+home.Organization+`"}`); status != http.StatusNoContent {
		t.Fatalf("switch: %d", status)
	}
	if got := viewer(t, s, carol); got.Organization != home.Organization {
		t.Fatalf("after switch: %+v", got)
	}
	if status, _ := session(t, s, bob, http.MethodPost, "/auth/workspace", `{"workspaceId":"`+own.Organization+`"}`); status != http.StatusForbidden {
		t.Fatalf("switching into a stranger's workspace: %d", status)
	}
}
