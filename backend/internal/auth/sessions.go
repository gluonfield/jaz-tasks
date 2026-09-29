package auth

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

const SessionTTL = 30 * 24 * time.Hour

var (
	ErrEmailUnverified = errors.New("your identity provider has not verified this email address")
	ErrNotAllowed      = errors.New("this email address is not allowed to sign in to this workspace")
)

// Identity is what an identity provider asserts about a person.
type Identity struct {
	Issuer        string
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

// SignIn finds or creates the user behind an identity. Known identities and
// existing users by email always pass; new users need an allowlisted email,
// or, with no allowlist configured, to be the very first sign-in, who
// becomes the workspace owner.
func (s *Service) SignIn(ctx context.Context, id Identity) (storage.User, error) {
	if !id.EmailVerified || id.Email == "" {
		return storage.User{}, ErrEmailUnverified
	}
	if user, err := s.store.UserByIdentity(ctx, id.Issuer, id.Subject); !errors.Is(err, storage.ErrNotFound) {
		return user, err
	}
	users, err := s.store.UsersByEmail(ctx, id.Email)
	if err != nil {
		return storage.User{}, err
	}
	if len(users) == 1 {
		return users[0], s.store.LinkIdentity(ctx, id.Issuer, id.Subject, users[0].ID)
	}
	open := len(s.cfg.AllowedEmailDomains) == 0 && len(s.cfg.AllowedEmails) == 0
	if !open && !s.allowed(id.Email) {
		return storage.User{}, ErrNotAllowed
	}
	name := strings.TrimSpace(id.Name)
	if name == "" {
		name, _, _ = strings.Cut(id.Email, "@")
	}
	handle, _, _ := strings.Cut(id.Email, "@")
	user := storage.NewUser{Name: name, DisplayName: strings.ToLower(handle), Email: id.Email, Admin: open}
	if id.Picture != "" {
		user.AvatarURL = &id.Picture
	}
	created, err := s.store.CreateIdentityUser(ctx, user, id.Issuer, id.Subject, open)
	if errors.Is(err, storage.ErrConflict) {
		return storage.User{}, ErrNotAllowed
	}
	return created, err
}

func (s *Service) allowed(email string) bool {
	_, domain, _ := strings.Cut(strings.ToLower(email), "@")
	return slices.ContainsFunc(s.cfg.AllowedEmails, func(e string) bool { return strings.EqualFold(e, email) }) ||
		slices.ContainsFunc(s.cfg.AllowedEmailDomains, func(d string) bool { return strings.EqualFold(d, domain) })
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

func (s *Service) EndSession(ctx context.Context, token string) error {
	return s.store.DeleteSession(ctx, hash(token))
}

// Viewer is the actor's user record.
func (s *Service) Viewer(ctx context.Context, actor Actor) (storage.User, error) {
	return s.store.UserByID(ctx, actor.UserID)
}
