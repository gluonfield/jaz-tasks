package auth

import (
	"context"
	"errors"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

const SessionTTL = 30 * 24 * time.Hour

// Identity is what an identity provider asserts about a person.
type Identity struct {
	Issuer        string
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

// DevUser is the seeded owner that development login signs in as.
func (s *Service) DevUser(ctx context.Context) (storage.User, error) {
	return s.store.DevUser(ctx)
}

// CreateSession starts a browser session and returns its cookie value.
func (s *Service) CreateSession(ctx context.Context, userID string) (string, time.Time, error) {
	token := secret("")
	expires := s.now().Add(SessionTTL)
	return token, expires, s.store.CreateSession(ctx, hash(token), userID, expires)
}

func (s *Service) Session(ctx context.Context, token string) (Actor, error) {
	user, err := s.store.UserBySession(ctx, hash(token))
	if errors.Is(err, storage.ErrNotFound) {
		return Actor{}, ErrUnauthenticated
	}
	return actorOf(user), err
}

// SwitchSession points a browser session at another of the person's users.
func (s *Service) SwitchSession(ctx context.Context, token, userID string) error {
	return s.store.UpdateSessionUser(ctx, hash(token), userID)
}

func (s *Service) EndSession(ctx context.Context, token string) error {
	return s.store.DeleteSession(ctx, hash(token))
}

// Viewer is the actor's user record.
func (s *Service) Viewer(ctx context.Context, actor Actor) (storage.User, error) {
	return s.store.UserByID(ctx, actor.UserID)
}
