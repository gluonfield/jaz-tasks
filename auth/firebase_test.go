package signin

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

type keyTransport struct {
	http.RoundTripper
	target string
}

func (k keyTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.URL.String() == firebaseKeys {
		r = r.Clone(r.Context())
		r.URL, _ = url.Parse(k.target)
	}
	return k.RoundTripper.RoundTrip(r)
}

func firebaseFixture(t *testing.T) (*Firebase, func(map[string]any, *rsa.PrivateKey, string) string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	keys := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "test-key", Algorithm: "RS256", Use: "sig"}}})
	}))
	t.Cleanup(keys.Close)
	original := http.DefaultTransport
	http.DefaultTransport = keyTransport{RoundTripper: original, target: keys.URL}
	t.Cleanup(func() {
		http.DefaultTransport = original
	})
	sign := func(overrides map[string]any, signingKey *rsa.PrivateKey, kid string) string {
		claims := map[string]any{
			"iss": "https://securetoken.google.com/test-pool", "aud": "test-pool", "sub": "firebase-uid",
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(), "auth_time": time.Now().Unix(),
			"email": "Ada@Example.com", "email_verified": true, "name": "Ada", "picture": "https://img.test/ada",
			"firebase": map[string]any{"identities": map[string][]string{"google.com": {"google-sub"}}},
		}
		for field, value := range overrides {
			claims[field] = value
		}
		if signingKey == nil {
			signingKey = key
		}
		options := (&jose.SignerOptions{}).WithType("JWT")
		if kid != "" {
			options = options.WithHeader("kid", kid)
		}
		signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: signingKey}, options)
		if err != nil {
			t.Fatal(err)
		}
		token, err := jwt.Signed(signer).Claims(claims).Serialize()
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	return NewFirebase("test-pool"), sign
}

func TestFirebaseTokenTrust(t *testing.T) {
	firebase, sign := firebaseFixture(t)
	id, err := firebase.Verify(context.Background(), sign(nil, nil, "test-key"))
	if err != nil || id.Issuer != "https://securetoken.google.com/test-pool" || id.Subject != "firebase-uid" || id.Email != "ada@example.com" || !id.EmailVerified ||
		len(id.LinkedIdentities) != 2 || id.LinkedIdentities[0] != (Subject{Issuer: "https://accounts.google.com", Subject: "google-sub"}) {
		t.Fatalf("verified identity: %+v, %v", id, err)
	}
	for name, claims := range map[string]map[string]any{
		"other pool":      {"iss": "https://securetoken.google.com/other-pool", "aud": "other-pool"},
		"other issuer":    {"iss": "https://idp.test"},
		"other audience":  {"aud": "other-pool"},
		"expired":         {"exp": time.Now().Add(-time.Minute).Unix()},
		"future issue":    {"iat": time.Now().Add(time.Minute).Unix()},
		"future sign-in":  {"auth_time": time.Now().Add(time.Minute).Unix()},
		"stale sign-in":   {"auth_time": time.Now().Add(-11 * time.Minute).Unix()},
		"missing sign-in": {"auth_time": 0},
		"missing subject": {"sub": ""},
		"long subject":    {"sub": strings.Repeat("a", 129)},
		"tenant pool":     {"firebase": map[string]any{"tenant": "another-pool"}},
		"array audience":  {"aud": []string{"test-pool"}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := firebase.Verify(context.Background(), sign(claims, nil, "test-key")); err == nil {
				t.Fatal("untrusted token accepted")
			}
		})
	}
	wrongKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{sign(nil, wrongKey, "test-key"), sign(nil, nil, ""), "not-a-token"} {
		if _, err := firebase.Verify(context.Background(), token); err == nil {
			t.Fatal("invalid signature or header accepted")
		}
	}
}
