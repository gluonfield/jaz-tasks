package signin

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestFirebaseHTTPExchange(t *testing.T) {
	_, sign := firebaseFixture(t)
	srv := httptest.NewUnstartedServer(nil)
	base := "http://" + srv.Listener.Addr().String()
	var identities []Identity
	handler, err := NewHandler(Config{Provider: "firebase", PublicURL: base, Firebase: FirebaseConfig{ProjectID: "test-pool", APIKey: "test-api", AuthDomain: "test-pool.firebaseapp.com", AppID: "test-app"}}, "Test app", "test_login", func(w http.ResponseWriter, r *http.Request, id Identity) bool {
		identities = append(identities, id)
		http.SetCookie(w, &http.Cookie{Name: "test_session", Value: id.Subject, HttpOnly: true})
		return true
	})
	if err != nil {
		t.Fatal(err)
	}
	srv.Config.Handler = handler
	srv.Start()
	t.Cleanup(srv.Close)
	page := func(returnTo string) (*http.Cookie, string) {
		t.Helper()
		res, err := srv.Client().Get(base + "/login?return_to=" + returnTo)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != http.StatusOK || !strings.Contains(string(body), "Continue with Google") || len(res.Cookies()) != 1 || !res.Cookies()[0].HttpOnly {
			t.Fatalf("login page: %d %s", res.StatusCode, body)
		}
		matches := regexp.MustCompile(`'X-CSRF-Token': ("[^"]+")`).FindSubmatch(body)
		if len(matches) != 2 {
			t.Fatalf("missing browser CSRF token: %s", body)
		}
		var csrf string
		if err := json.Unmarshal(matches[1], &csrf); err != nil {
			t.Fatal(err)
		}
		return res.Cookies()[0], csrf
	}
	post := func(cookie *http.Cookie, csrf, origin, contentType, token string) *http.Response {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"idToken": token})
		req, _ := http.NewRequest(http.MethodPost, base+"/auth/firebase", strings.NewReader(string(body)))
		if cookie != nil {
			req.AddCookie(cookie)
		}
		req.Header.Set("Content-Type", contentType)
		req.Header.Set("Origin", origin)
		req.Header.Set("X-CSRF-Token", csrf)
		res, err := srv.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	token := sign(nil, nil, "test-key")
	for _, test := range []struct {
		name        string
		origin      string
		contentType string
		csrf        string
		status      int
	}{
		{name: "cross-origin", origin: "https://evil.test", contentType: "application/json", status: http.StatusForbidden},
		{name: "form", origin: base, contentType: "application/x-www-form-urlencoded", status: http.StatusUnsupportedMediaType},
		{name: "wrong challenge", origin: base, contentType: "application/json", csrf: "wrong", status: http.StatusForbidden},
	} {
		t.Run(test.name, func(t *testing.T) {
			cookie, csrf := page("/workspace")
			if test.csrf != "" {
				csrf = test.csrf
			}
			res := post(cookie, csrf, test.origin, test.contentType, token)
			res.Body.Close()
			if res.StatusCode != test.status || len(identities) != 0 {
				t.Fatalf("request accepted: %d", res.StatusCode)
			}
		})
	}
	cookie, csrf := page("/workspace")
	raw, _ := base64.RawURLEncoding.DecodeString(cookie.Value)
	var expired loginState
	_ = json.Unmarshal(raw, &expired)
	expired.Expires = time.Now().Add(-time.Minute).Unix()
	raw, _ = json.Marshal(expired)
	cookie.Value = base64.RawURLEncoding.EncodeToString(raw)
	res := post(cookie, csrf, base, "application/json", token)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden || len(identities) != 0 {
		t.Fatal("expired challenge accepted")
	}
	cookie, csrf = page("/workspace")
	res = post(cookie, csrf, base, "application/json", "invalid-token")
	res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized || len(identities) != 0 {
		t.Fatal("invalid token reached account callback")
	}
	for _, cleared := range res.Cookies() {
		if cleared.Name == cookie.Name {
			t.Fatal("failed exchange cleared the retry challenge")
		}
	}
	for _, returnTo := range []string{"/workspace", "https://evil.test"} {
		if returnTo != "/workspace" {
			cookie, csrf = page(returnTo)
		}
		res = post(cookie, csrf, base, "application/json", token)
		var out struct {
			Redirect string `json:"redirect"`
		}
		err := json.NewDecoder(res.Body).Decode(&out)
		res.Body.Close()
		expected := returnTo
		if returnTo == "https://evil.test" {
			expected = "/"
		}
		if err != nil || res.StatusCode != http.StatusOK || out.Redirect != expected || identities[len(identities)-1].Subject != "firebase-uid" {
			t.Fatalf("sign-in: %d %+v %v", res.StatusCode, out, err)
		}
		foundSession := false
		clearedChallenge := false
		for _, cookie := range res.Cookies() {
			foundSession = foundSession || cookie.Name == "test_session"
			clearedChallenge = clearedChallenge || (cookie.Name == "test_login" && cookie.Value == "")
		}
		if !foundSession || !clearedChallenge {
			t.Fatal("application session missing")
		}
	}
}
