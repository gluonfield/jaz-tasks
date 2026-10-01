package signin

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
)

type Subject struct {
	Issuer  string
	Subject string
}

type Identity struct {
	Issuer           string
	Subject          string
	Email            string
	EmailVerified    bool
	Name             string
	Picture          string
	LinkedIdentities []Subject
}

type Config struct {
	Provider  string
	PublicURL string
	OIDC      OIDCConfig
	Firebase  FirebaseConfig
}

type FirebaseConfig struct {
	APIKey     string `json:"apiKey"`
	AuthDomain string `json:"authDomain"`
	ProjectID  string `json:"projectId"`
	AppID      string `json:"appId"`
}

func ConfigFromEnv(publicURL string) (Config, error) {
	cfg := Config{
		Provider:  strings.TrimSpace(os.Getenv("AUTH_PROVIDER")),
		PublicURL: publicURL,
		OIDC: OIDCConfig{
			Issuer:       strings.TrimSpace(os.Getenv("OIDC_ISSUER")),
			ClientID:     strings.TrimSpace(os.Getenv("OIDC_CLIENT_ID")),
			ClientSecret: strings.TrimSpace(os.Getenv("OIDC_CLIENT_SECRET")),
			RedirectURL:  publicURL + "/auth/callback",
		},
	}
	if raw := strings.TrimSpace(os.Getenv("FIREBASE_CONFIG")); raw != "" {
		if err := json.Unmarshal([]byte(raw), &cfg.Firebase); err != nil {
			return Config{}, errors.New("FIREBASE_CONFIG must be a Firebase web configuration JSON object")
		}
	}
	return cfg, nil
}
