package authapi

import (
	"crypto/sha256"
	"encoding/hex"
	"html/template"
	"net/http"
	"net/url"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

// Server-rendered pages for flows that happen outside the web app. Their
// palette follows the web app's default tokens.
var pages = template.Must(template.New("layout").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.Title}} · Jaz Tasks</title>
<style>
:root{--bg:#f5f5f6;--card:#fdfdfd;--ink:#1c1d1f;--ink-2:#5f6168;--ink-3:#8f9199;--border:#e8e8ea;--primary:#5e6ad2;--on-primary:#fff;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0f1012;--card:#151618;--ink:#e6e7ea;--ink-2:#a0a3aa;--ink-3:#6e717a;--border:#26282c;--primary:#7480ea;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:13px/1.5 'Inter Variable',Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{width:min(400px,calc(100vw - 32px));background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px;box-shadow:0 8px 30px -12px rgb(0 0 0/.15)}
.logo{width:36px;height:36px;border-radius:9px;background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-weight:600;font-size:16px;margin-bottom:18px}
h1{font-size:16px;font-weight:600;margin:0 0 6px}p{margin:0;color:var(--ink-2)}.muted{color:var(--ink-3);font-size:12px;margin-top:14px}
ul{margin:16px 0 0;padding:12px 14px;border:1px solid var(--border);border-radius:8px;list-style:none;color:var(--ink-2)}li+li{margin-top:4px}
.actions{display:flex;gap:8px;margin-top:22px}button,a.button{flex:1;height:34px;border-radius:7px;border:1px solid var(--border);background:transparent;color:var(--ink);font:inherit;font-weight:500;display:grid;place-items:center;text-decoration:none;cursor:pointer}
button.primary{background:var(--primary);border-color:var(--primary);color:var(--on-primary)}
</style></head><body><main><div class="logo">J</div>{{template "body" .}}</main></body></html>`))

var messagePage = template.Must(template.Must(pages.Clone()).Parse(`{{define "body"}}<h1>{{.Title}}</h1><p>{{.Message}}</p>
<div class="actions"><a class="button" href="{{.Link}}">Back to Jaz Tasks</a></div>{{end}}`))

var consentPage = template.Must(template.Must(pages.Clone()).Parse(`{{define "body"}}<h1>Authorize {{.Client}}</h1>
<p><strong>{{.Client}}</strong> wants to access <strong>{{.Workspace}}</strong> as <strong>{{.User}}</strong>.</p>
<ul><li>Read and search issues, projects and teams</li><li>Create and update issues and comments</li></ul>
<form method="post" action="/oauth/authorize">
{{range $k, $v := .Params}}<input type="hidden" name="{{$k}}" value="{{$v}}">{{end}}
<div class="actions"><button name="decision" value="deny">Cancel</button><button class="primary" name="decision" value="allow" autofocus>Allow access</button></div>
</form><p class="muted">You will be sent back to {{.Redirect}}. You can revoke access at any time in Settings.</p>{{end}}`))

func page(w http.ResponseWriter, status int, title, message, link string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_ = messagePage.Execute(w, map[string]string{"Title": title, "Message": message, "Link": link})
}

func consent(w http.ResponseWriter, svc *auth.Service, r *http.Request, client storage.OAuthClient, req auth.AuthorizeRequest, actor auth.Actor, token string) {
	redirect, _ := url.Parse(req.RedirectURI)
	user, workspace, err := svc.Describe(r.Context(), actor)
	if err != nil {
		page(w, http.StatusInternalServerError, "Something went wrong", "Please try again.", "/")
		return
	}
	params := map[string]string{
		"response_type":         req.ResponseType,
		"client_id":             req.ClientID,
		"redirect_uri":          req.RedirectURI,
		"code_challenge":        req.CodeChallenge,
		"code_challenge_method": req.CodeChallengeMethod,
		"state":                 req.State,
		"scope":                 req.Scope,
		"resource":              req.Resource,
		"csrf":                  token,
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Cache-Control", "no-store")
	_ = consentPage.Execute(w, map[string]any{
		"Title":     "Authorize " + client.Name,
		"Client":    client.Name,
		"User":      user.Email,
		"Workspace": workspace.Name,
		"Redirect":  redirect.Scheme + "://" + redirect.Host,
		"Params":    params,
	})
}

// csrf binds the consent form to the browser session that rendered it.
func csrf(session *http.Cookie) string {
	if session == nil {
		return ""
	}
	sum := sha256.Sum256([]byte("consent:" + session.Value))
	return hex.EncodeToString(sum[:])
}
