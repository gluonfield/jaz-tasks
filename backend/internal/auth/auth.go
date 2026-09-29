package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

var ErrUnauthenticated = errors.New("authentication required: send an API key in the Authorization header")

// Actor is the authenticated user and the workspace every request is scoped to.
type Actor struct {
	UserID      string
	WorkspaceID string
}

type Service struct {
	store storage.AuthStore
}

func NewService(store storage.AuthStore) *Service {
	return &Service{store: store}
}

// Authenticate accepts an Authorization header carrying a raw key or a Bearer key.
func (s *Service) Authenticate(ctx context.Context, header string) (Actor, error) {
	key := strings.TrimSpace(header)
	if scheme, token, ok := strings.Cut(key, " "); ok && strings.EqualFold(scheme, "Bearer") {
		key = strings.TrimSpace(token)
	}
	if key == "" {
		return Actor{}, ErrUnauthenticated
	}
	user, err := s.store.UserByAPIKey(ctx, hash(key))
	if errors.Is(err, storage.ErrNotFound) {
		return Actor{}, ErrUnauthenticated
	}
	if err != nil {
		return Actor{}, err
	}
	return Actor{UserID: user.ID, WorkspaceID: user.WorkspaceID}, nil
}

// CreateKey stores the given key for the user, generating one when key is empty.
func (s *Service) CreateKey(ctx context.Context, userID, label, key string) (string, error) {
	if key == "" {
		secret := make([]byte, 20)
		if _, err := rand.Read(secret); err != nil {
			return "", err
		}
		key = "jt_api_" + hex.EncodeToString(secret)
	}
	return key, s.store.CreateAPIKey(ctx, userID, label, hash(key))
}

// CreateKeyForEmail mints a key for the one active user with that email.
func (s *Service) CreateKeyForEmail(ctx context.Context, email string) (string, error) {
	users, err := s.store.UsersByEmail(ctx, email)
	if err != nil {
		return "", err
	}
	if len(users) != 1 {
		return "", fmt.Errorf("%d active users have email %q", len(users), email)
	}
	return s.CreateKey(ctx, users[0].ID, "Minted from the command line", "")
}

func hash(key string) []byte {
	sum := sha256.Sum256([]byte(key))
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
