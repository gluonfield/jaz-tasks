package signin

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type OIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

type OIDC struct {
	cfg      OIDCConfig
	mu       sync.Mutex
	provider *oidc.Provider
}

func NewOIDC(cfg OIDCConfig) *OIDC {
	return &OIDC{cfg: cfg}
}

func (o *OIDC) Enabled() bool {
	return o.cfg.Issuer != "" && o.cfg.ClientID != ""
}

func (o *OIDC) Name() string {
	switch {
	case strings.Contains(o.cfg.Issuer, "accounts.google.com"):
		return "Google"
	case strings.Contains(o.cfg.Issuer, "login.microsoftonline.com"):
		return "Microsoft"
	default:
		return "SSO"
	}
}

func (o *OIDC) setup(ctx context.Context) (*oidc.Provider, *oauth2.Config, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.provider == nil {
		provider, err := oidc.NewProvider(oidc.ClientContext(ctx, &http.Client{Timeout: 10 * time.Second}), o.cfg.Issuer)
		if err != nil {
			return nil, nil, fmt.Errorf("discover provider: %w", err)
		}
		o.provider = provider
	}
	return o.provider, &oauth2.Config{
		ClientID:     o.cfg.ClientID,
		ClientSecret: o.cfg.ClientSecret,
		Endpoint:     o.provider.Endpoint(),
		RedirectURL:  o.cfg.RedirectURL,
		Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
	}, nil
}

func (o *OIDC) AuthURL(ctx context.Context, state, nonce, verifier string) (string, error) {
	_, cfg, err := o.setup(ctx)
	if err != nil {
		return "", err
	}
	return cfg.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)), nil
}

func (o *OIDC) Exchange(ctx context.Context, code, verifier, nonce string) (Identity, error) {
	provider, cfg, err := o.setup(ctx)
	if err != nil {
		return Identity{}, err
	}
	token, err := cfg.Exchange(oidc.ClientContext(ctx, &http.Client{Timeout: 10 * time.Second}), code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Identity{}, fmt.Errorf("exchange code: %w", err)
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		return Identity{}, errors.New("provider returned no id_token")
	}
	idToken, err := provider.Verifier(&oidc.Config{ClientID: o.cfg.ClientID}).Verify(ctx, raw)
	if err != nil {
		return Identity{}, fmt.Errorf("verify id_token: %w", err)
	}
	if idToken.Nonce != nonce || idToken.Subject == "" {
		return Identity{}, errors.New("id_token nonce or subject mismatch")
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified any    `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return Identity{}, err
	}
	return Identity{
		Issuer:        idToken.Issuer,
		Subject:       idToken.Subject,
		Email:         strings.ToLower(claims.Email),
		EmailVerified: claims.EmailVerified == true || claims.EmailVerified == "true",
		Name:          claims.Name,
		Picture:       claims.Picture,
	}, nil
}
