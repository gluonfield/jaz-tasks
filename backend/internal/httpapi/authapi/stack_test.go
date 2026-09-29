package authapi_test

import (
	"context"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/charmbracelet/log"
	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/authapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/gql"
	"github.com/gluonfield/jaz-tasks/backend/internal/httpapi/mcpapi"
	"github.com/gluonfield/jaz-tasks/backend/internal/seed"
	"github.com/gluonfield/jaz-tasks/backend/internal/server"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
)

type stack struct {
	url    string
	apiKey string
}

// start runs the whole HTTP stack on a loopback URL that doubles as PUBLIC_URL.
func start(t *testing.T, oidc auth.OIDCConfig, members workspaces.Config, devLogin bool) stack {
	t.Helper()
	srv := httptest.NewUnstartedServer(nil)
	base := "http://" + srv.Listener.Addr().String()
	store := postgrestest.New(t)
	keys := auth.NewService(store, auth.Config{PublicURL: base})
	svc := tracker.NewService(store, tracker.PublicURL(base))
	result, _, err := seed.Run(context.Background(), store, keys, svc, "")
	if err != nil {
		t.Fatal(err)
	}
	logger := log.New(io.Discard)
	oidc.RedirectURL = base + "/auth/callback"
	people := workspaces.NewService(store, members)
	authn, err := authapi.NewHandler(keys, people, auth.NewOIDC(oidc), authapi.DevLogin(devLogin), logger)
	if err != nil {
		t.Fatal(err)
	}
	srv.Config.Handler = server.New(authn, gql.NewHandler(svc, people, logger), mcpapi.NewHandler(svc, keys, gql.NewHandler(svc, people, logger)), "", logger)
	srv.Start()
	t.Cleanup(srv.Close)
	return stack{url: base, apiKey: result.APIKey}
}

// browser keeps cookies and hands redirects back instead of following them.
func browser() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

func (s stack) devSignIn(t *testing.T, b *http.Client) {
	t.Helper()
	res, err := b.PostForm(s.url+"/auth/dev-login", url.Values{"return_to": {"/"}})
	if err != nil || res.StatusCode != http.StatusSeeOther {
		t.Fatalf("dev login: %v %v", res.StatusCode, err)
	}
	res.Body.Close()
}

var hiddenInput = regexp.MustCompile(`<input type="hidden" name="([^"]+)" value="([^"]*)">`)

// consent opens an authorization URL in a signed-in browser, approves it and
// returns the redirect the client receives.
func consent(t *testing.T, b *http.Client, authorizeURL string) *url.URL {
	t.Helper()
	res, err := b.Get(authorizeURL)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusOK || !strings.Contains(string(body), "Allow access") {
		t.Fatalf("consent page: %d %s", res.StatusCode, body)
	}
	form := url.Values{"decision": {"allow"}}
	for _, m := range hiddenInput.FindAllStringSubmatch(string(body), -1) {
		form.Set(m[1], htmlUnescape(m[2]))
	}
	u, _ := url.Parse(authorizeURL)
	res, err = b.PostForm(u.Scheme+"://"+u.Host+"/oauth/authorize", form)
	if err != nil || res.StatusCode != http.StatusSeeOther {
		t.Fatalf("approve: %v %v", res.StatusCode, err)
	}
	res.Body.Close()
	location, _ := url.Parse(res.Header.Get("Location"))
	return location
}

func htmlUnescape(s string) string {
	return strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&#34;", `"`, "&#39;", "'", "&#43;", "+").Replace(s)
}
