package auth

import (
	"context"
	"fmt"
	"strings"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

// CreateKey stores a personal API key for the user, generating one when key
// is empty, and returns the key; only its hash is kept.
func (s *Service) CreateKey(ctx context.Context, userID, label, key string) (string, storage.APIKey, error) {
	if label = strings.TrimSpace(label); label == "" {
		return "", storage.APIKey{}, fmt.Errorf("a label is required")
	}
	if key == "" {
		key = secret(apiKeyPrefix)
	}
	record, err := s.store.CreateAPIKey(ctx, userID, label, "…"+key[max(0, len(key)-4):], hash(key))
	return key, record, err
}

func (s *Service) APIKeys(ctx context.Context, actor Actor) ([]storage.APIKey, error) {
	return s.store.APIKeys(ctx, actor.UserID)
}

func (s *Service) DeleteKey(ctx context.Context, actor Actor, id string) error {
	return s.store.DeleteAPIKey(ctx, actor.UserID, id)
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
	key, _, err := s.CreateKey(ctx, users[0].ID, "Minted from the command line", "")
	return key, err
}
