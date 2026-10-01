package signin

import (
	"crypto/rand"
	_ "embed"
	"html/template"
	"net/http"
	"net/url"
	"time"
)

//go:embed login.html
var loginHTML string

var loginPage = template.Must(template.New("login").Parse(loginHTML))

func (h *Handler) page(w http.ResponseWriter, r *http.Request) {
	data := struct {
		App      string
		Provider string
		LoginURL string
		Firebase *FirebaseConfig
		CSRF     string
	}{App: h.app, LoginURL: "/auth/login?return_to=" + url.QueryEscape(returnTo(r.URL.Query().Get("return_to")))}
	if h.cfg.Provider == "firebase" {
		state := loginState{State: rand.Text(), ReturnTo: returnTo(r.URL.Query().Get("return_to")), Expires: time.Now().Add(10 * time.Minute).Unix()}
		h.setState(w, state)
		data.Firebase = &h.cfg.Firebase
		data.CSRF = state.State
		data.Provider = "Google"
	} else if h.oidc.Enabled() {
		data.Provider = h.oidc.Name()
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = loginPage.Execute(w, data)
}
