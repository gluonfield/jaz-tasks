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

func viewer(t *testing.T, s stack, b *http.Client) (email string, admin bool) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, s.url+"/graphql", strings.NewReader(`{"query":"{ viewer { email admin } }"}`))
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
		} `json:"data"`
	}
	_ = json.NewDecoder(res.Body).Decode(&out)
	return out.Data.Viewer.Email, out.Data.Viewer.Admin
}

func TestOIDCSignInWithoutAllowlist(t *testing.T) {
	iss := newIssuer(t)
	s := start(t, auth.OIDCConfig{Issuer: iss.URL, ClientID: "client-1", ClientSecret: "secret"}, auth.Config{}, false)

	owner := browser()
	res := iss.signIn(t, s, owner, "owner@example.com", true)
	res.Body.Close()
	if res.StatusCode != http.StatusFound || res.Header.Get("Location") != "/team/ENG/all" {
		t.Fatalf("first sign-in: %d %s", res.StatusCode, res.Header.Get("Location"))
	}
	if email, admin := viewer(t, s, owner); email != "owner@example.com" || !admin {
		t.Fatalf("owner viewer: %s admin=%v", email, admin)
	}

	stranger := browser()
	res = iss.signIn(t, s, stranger, "stranger@example.com", true)
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden || !strings.Contains(string(body), "Access denied") {
		t.Fatalf("second new user: %d", res.StatusCode)
	}

	existing := browser()
	res = iss.signIn(t, s, existing, "sofia@jaz.local", true)
	res.Body.Close()
	if email, admin := viewer(t, s, existing); res.StatusCode != http.StatusFound || email != "sofia@jaz.local" || admin {
		t.Fatalf("existing user: %d %s admin=%v", res.StatusCode, email, admin)
	}

	unverified := browser()
	res = iss.signIn(t, s, unverified, "mira@jaz.local", false)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("unverified email: %d", res.StatusCode)
	}

	req, _ := http.NewRequest(http.MethodPost, s.url+"/auth/logout", nil)
	res, _ = owner.Do(req)
	res.Body.Close()
	if email, _ := viewer(t, s, owner); email != "" {
		t.Fatalf("session survived logout: %s", email)
	}
	if res, _ := http.PostForm(s.url+"/auth/dev-login", nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("dev login must be off with OIDC: %d", res.StatusCode)
	}
}

func TestOIDCSignInWithAllowlist(t *testing.T) {
	iss := newIssuer(t)
	s := start(t, auth.OIDCConfig{Issuer: iss.URL, ClientID: "client-1"}, auth.Config{AllowedEmailDomains: []string{"ml.ink"}, AllowedEmails: []string{"guest@example.com"}}, false)
	for email, allowed := range map[string]bool{"ana@ml.ink": true, "guest@example.com": true, "first@example.com": false} {
		b := browser()
		res := iss.signIn(t, s, b, email, true)
		res.Body.Close()
		got, admin := viewer(t, s, b)
		if allowed != (got == email) || admin {
			t.Errorf("%s: status %d, viewer %q admin=%v", email, res.StatusCode, got, admin)
		}
	}
}
