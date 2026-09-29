package postgres

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	authdb "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/auth"
)

func (s *Store) UserByAPIKey(ctx context.Context, keyHash []byte) (storage.User, error) {
	return one(toAuthUser)(s.auth.UserByAPIKey(ctx, keyHash))
}

func (s *Store) CreateAPIKey(ctx context.Context, userID, label string, keyHash []byte) error {
	return mapError(s.auth.CreateAPIKey(ctx, authdb.CreateAPIKeyParams{UserID: userID, Label: label, KeyHash: keyHash}))
}
