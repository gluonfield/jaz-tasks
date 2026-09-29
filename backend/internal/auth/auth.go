// Package auth owns identity: sessions for people, OAuth 2.1 grants for
// agents and apps, and personal API keys for scripts.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

var ErrUnauthenticated = errors.New("authentication required: sign in, or send an OAuth access token or API key in the Authorization header")

// Actor is the authenticated user and the workspace every request is scoped to.
type Actor struct {
	UserID      string
	WorkspaceID string
}

func actorOf(user storage.User) Actor {
	return Actor{UserID: user.ID, WorkspaceID: user.WorkspaceID}
}

type Config struct {
	// PublicURL is the issuer of OAuth tokens and the base of every auth URL.
	PublicURL string
}

type Service struct {
	store storage.AuthStore
	cfg   Config
	now   func() time.Time
}

func NewService(store storage.AuthStore, cfg Config) *Service {
	cfg.PublicURL = strings.TrimRight(cfg.PublicURL, "/")
	return &Service{store: store, cfg: cfg, now: time.Now}
}

const (
	apiKeyPrefix       = "jt_api_"
	accessTokenPrefix  = "jt_at_"
	refreshTokenPrefix = "jt_rt_"
)

// Authenticate resolves an Authorization header carrying an API key, raw or
// as a Bearer token like Linear's, or a Bearer OAuth access token.
func (s *Service) Authenticate(ctx context.Context, header string) (Actor, error) {
	token := strings.TrimSpace(header)
	if scheme, value, ok := strings.Cut(token, " "); ok && strings.EqualFold(scheme, "Bearer") {
		token = strings.TrimSpace(value)
	}
	var user storage.User
	var err error
	switch {
	case strings.HasPrefix(token, accessTokenPrefix):
		user, err = s.store.UserByAccessToken(ctx, hash(token))
	case token != "":
		user, err = s.store.UserByAPIKey(ctx, hash(token))
	default:
		return Actor{}, ErrUnauthenticated
	}
	if errors.Is(err, storage.ErrNotFound) {
		return Actor{}, ErrUnauthenticated
	}
	return actorOf(user), err
}

func secret(prefix string) string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return prefix + base64.RawURLEncoding.EncodeToString(b)
}

func hash(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

type actorKey struct{}

func WithActor(ctx context.Context, actor Actor) context.Context {
	return context.WithValue(ctx, actorKey{}, actor)
}

func ActorFrom(ctx context.Context) (Actor, bool) {
	actor, ok := ctx.Value(actorKey{}).(Actor)
	return actor, ok
}
