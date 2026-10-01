package signin

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-jose/go-jose/v4"
)

const firebaseKeys = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

type Firebase struct {
	verifier *oidc.IDTokenVerifier
	project  string
}

func NewFirebase(projectID string) *Firebase {
	ctx := oidc.ClientContext(context.Background(), &http.Client{Timeout: 10 * time.Second})
	return &Firebase{
		verifier: oidc.NewVerifier("https://securetoken.google.com/"+projectID, oidc.NewRemoteKeySet(ctx, firebaseKeys), &oidc.Config{ClientID: projectID}),
		project:  projectID,
	}
}

func (f *Firebase) Verify(ctx context.Context, raw string) (Identity, error) {
	signed, err := jose.ParseSigned(raw, []jose.SignatureAlgorithm{jose.RS256})
	if err != nil || len(signed.Signatures) != 1 || signed.Signatures[0].Header.KeyID == "" {
		return Identity{}, errors.New("invalid Firebase token header")
	}
	token, err := f.verifier.Verify(ctx, raw)
	if err != nil {
		return Identity{}, err
	}
	var claims struct {
		Audience      string `json:"aud"`
		AuthTime      int64  `json:"auth_time"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		Firebase      struct {
			Tenant     string              `json:"tenant"`
			Identities map[string][]string `json:"identities"`
		} `json:"firebase"`
	}
	if err := token.Claims(&claims); err != nil {
		return Identity{}, err
	}
	now := time.Now()
	authTime := time.Unix(claims.AuthTime, 0)
	if claims.Audience != f.project || token.Subject == "" || len(token.Subject) > 128 || token.IssuedAt.IsZero() || token.IssuedAt.After(now) ||
		claims.AuthTime <= 0 || authTime.After(now) || now.Sub(authTime) > 10*time.Minute || claims.Firebase.Tenant != "" {
		return Identity{}, errors.New("Firebase token is outside this pool or needs a fresh sign-in")
	}
	id := Identity{
		Issuer:        token.Issuer,
		Subject:       token.Subject,
		Email:         strings.ToLower(claims.Email),
		EmailVerified: claims.EmailVerified,
		Name:          claims.Name,
		Picture:       claims.Picture,
	}
	// Firebase's signed provider subjects preserve existing Google memberships.
	for _, subject := range claims.Firebase.Identities["google.com"] {
		if subject != "" {
			id.LinkedIdentities = append(id.LinkedIdentities,
				Subject{Issuer: "https://accounts.google.com", Subject: subject},
				Subject{Issuer: "accounts.google.com", Subject: subject},
			)
		}
	}
	return id, nil
}
