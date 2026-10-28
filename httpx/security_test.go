package httpx_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gluonfield/jaz-tasks/httpx"
)

func TestSecurityPolicyPreservesResponseAndRouteRestrictions(t *testing.T) {
	handler := httpx.Secure(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/image" {
			w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		}
		_, _ = io.WriteString(w, "response")
	}))
	for _, path := range []string{"/", "/image"} {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "https://tasks.test"+path, nil))
		if res.Code != 200 || res.Body.String() != "response" || res.Header().Get("X-Content-Type-Options") != "nosniff" || res.Header().Get("Strict-Transport-Security") == "" {
			t.Fatalf("security wrapper changed response or omitted protection: %+v", res.Result())
		}
		policy := res.Header().Get("Content-Security-Policy")
		if path == "/image" {
			if policy != "default-src 'none'; sandbox" {
				t.Fatalf("route sandbox was weakened: %s", policy)
			}
		} else if !strings.Contains(policy, "frame-ancestors 'self'") || !strings.Contains(policy, "object-src 'none'") || res.Header().Get("Referrer-Policy") == "" {
			t.Fatalf("missing browser policy: %s", policy)
		}
	}
}
