// Package workspaces owns membership: who may sign in, the workspace a new
// person starts with, invites, and switching between workspaces.
package workspaces

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"slices"
	"strings"
	"unicode"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

var (
	ErrEmailUnverified = errors.New("your identity provider has not verified this email address")
	ErrNotAllowed      = errors.New("this email address is not allowed to sign in here")
	ErrForbidden       = errors.New("only workspace admins can manage invites")
	ErrNotMember       = errors.New("you are not a member of that workspace")
)

// Config optionally restricts sign-in; empty lists admit every verified email.
type Config struct {
	AllowedEmailDomains []string
	AllowedEmails       []string
}

type Service struct {
	store storage.WorkspaceStore
	cfg   Config
}

func NewService(store storage.WorkspaceStore, cfg Config) *Service {
	return &Service{store: store, cfg: cfg}
}

// SignIn returns the user a person acts as. Accounts provisioned for their
// email become theirs and pending invites are accepted, all appearing in the
// workspace switcher; people keep landing in their first workspace, a
// newcomer lands in a provisioned account or else the inviting workspace,
// and anyone else gets a workspace of their own.
func (s *Service) SignIn(ctx context.Context, id auth.Identity) (storage.User, error) {
	if !id.EmailVerified || id.Email == "" {
		return storage.User{}, ErrEmailUnverified
	}
	if !s.allowed(id.Email) {
		return storage.User{}, ErrNotAllowed
	}
	identity := storage.Identity{Issuer: id.Issuer, Subject: id.Subject}
	users, err := s.store.UsersByIdentity(ctx, id.Issuer, id.Subject)
	if err != nil {
		return storage.User{}, err
	}
	claimed, err := s.store.ShareIdentity(ctx, emailIdentity(id.Email), identity)
	if err != nil {
		return storage.User{}, err
	}
	joined, err := s.acceptInvites(ctx, identity, member(id))
	switch {
	case err != nil:
		return storage.User{}, err
	case len(users) > 0:
		return users[0], nil
	case len(claimed) > 0:
		return claimed[0], nil
	case joined != nil:
		return *joined, nil
	}
	return s.createOwned(ctx, member(id), firstName(id.Name, id.Email), identity)
}

// Provision returns the account a deployment declares for the email: its
// first user, or a new one with a workspace of its own that whoever signs in
// with that verified email takes over.
func (s *Service) Provision(ctx context.Context, email string) (storage.User, error) {
	users, err := s.store.UsersByEmail(ctx, email)
	if err != nil {
		return storage.User{}, err
	}
	if len(users) > 0 {
		return users[0], nil
	}
	return s.createOwned(ctx, member(auth.Identity{Email: email}), firstName("", email), emailIdentity(email))
}

// emailIdentity stands for anyone who proves they hold the address, which is
// how a provisioned account awaits its person.
func emailIdentity(email string) storage.Identity {
	return storage.Identity{Issuer: "email", Subject: strings.ToLower(email)}
}

// createOwned starts a person in a workspace of their own, like Linear's
// onboarding: a Personal workspace and a first team named after them.
func (s *Service) createOwned(ctx context.Context, owner storage.NewUser, name string, identity storage.Identity) (storage.User, error) {
	owner.Admin = true
	return s.store.CreateOwnedWorkspace(ctx,
		storage.NewWorkspace{Name: "Personal", URLKey: slug(name) + "-" + suffix()},
		owner, identity,
		storage.NewTeam{Key: teamKey(name), Name: name},
		tracker.DefaultStates,
	)
}

func (s *Service) allowed(email string) bool {
	if len(s.cfg.AllowedEmailDomains) == 0 && len(s.cfg.AllowedEmails) == 0 {
		return true
	}
	_, domain, _ := strings.Cut(email, "@")
	return slices.ContainsFunc(s.cfg.AllowedEmails, func(e string) bool { return strings.EqualFold(e, email) }) ||
		slices.ContainsFunc(s.cfg.AllowedEmailDomains, func(d string) bool { return strings.EqualFold(d, domain) })
}

// acceptInvites joins every workspace inviting the member's email that the
// identity is not already in, returning the last one joined.
func (s *Service) acceptInvites(ctx context.Context, identity storage.Identity, m storage.NewUser) (*storage.User, error) {
	invites, err := s.store.InvitesByEmail(ctx, m.Email)
	if err != nil || len(invites) == 0 {
		return nil, err
	}
	users, err := s.store.UsersByIdentity(ctx, identity.Issuer, identity.Subject)
	if err != nil {
		return nil, err
	}
	var joined *storage.User
	for _, invite := range invites {
		if slices.ContainsFunc(users, func(u storage.User) bool { return u.WorkspaceID == invite.WorkspaceID }) {
			if err := s.store.DeleteInvite(ctx, invite.WorkspaceID, invite.ID); err != nil {
				return nil, err
			}
			continue
		}
		user, err := s.store.JoinWorkspace(ctx, invite, m, identity)
		if err != nil {
			return nil, err
		}
		joined = &user
	}
	return joined, nil
}

// Memberships lists the actor's workspaces, first accepting invites that
// arrived while they were signed in.
func (s *Service) Memberships(ctx context.Context, actor auth.Actor) ([]storage.Membership, error) {
	identity, err := s.store.UserIdentity(ctx, actor.UserID)
	if err == nil {
		user, err := s.store.UserByID(ctx, actor.UserID)
		if err != nil {
			return nil, err
		}
		if _, err := s.acceptInvites(ctx, identity, storage.NewUser{Name: user.Name, DisplayName: user.DisplayName, Email: user.Email, AvatarURL: user.AvatarURL}); err != nil {
			return nil, err
		}
	} else if !errors.Is(err, storage.ErrNotFound) {
		return nil, err
	}
	return s.store.Memberships(ctx, actor.UserID)
}

// Switch returns the actor's user in another of their workspaces.
func (s *Service) Switch(ctx context.Context, actor auth.Actor, workspaceID string) (storage.User, error) {
	memberships, err := s.store.Memberships(ctx, actor.UserID)
	if err != nil {
		return storage.User{}, err
	}
	i := slices.IndexFunc(memberships, func(m storage.Membership) bool { return m.WorkspaceID == workspaceID })
	if i < 0 {
		return storage.User{}, ErrNotMember
	}
	return s.store.UserByID(ctx, memberships[i].UserID)
}

func (s *Service) Invite(ctx context.Context, actor auth.Actor, email string) (storage.WorkspaceInvite, error) {
	if err := s.requireAdmin(ctx, actor); err != nil {
		return storage.WorkspaceInvite{}, err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if local, domain, ok := strings.Cut(email, "@"); !ok || local == "" || !strings.Contains(domain, ".") {
		return storage.WorkspaceInvite{}, tracker.InvalidInputError{Message: "enter a valid email address"}
	}
	invite, err := s.store.CreateInvite(ctx, actor.WorkspaceID, email, actor.UserID)
	if errors.Is(err, storage.ErrConflict) {
		return invite, tracker.InvalidInputError{Message: email + " is already invited"}
	}
	return invite, err
}

func (s *Service) Invites(ctx context.Context, actor auth.Actor) ([]storage.WorkspaceInvite, error) {
	return s.store.Invites(ctx, actor.WorkspaceID)
}

func (s *Service) CancelInvite(ctx context.Context, actor auth.Actor, id string) error {
	if err := s.requireAdmin(ctx, actor); err != nil {
		return err
	}
	err := s.store.DeleteInvite(ctx, actor.WorkspaceID, id)
	if errors.Is(err, storage.ErrNotFound) {
		return tracker.NotFoundError{Entity: "OrganizationInvite"}
	}
	return err
}

func (s *Service) requireAdmin(ctx context.Context, actor auth.Actor) error {
	user, err := s.store.UserByID(ctx, actor.UserID)
	if err != nil {
		return err
	}
	if !user.Admin {
		return ErrForbidden
	}
	return nil
}

func member(id auth.Identity) storage.NewUser {
	handle, _, _ := strings.Cut(id.Email, "@")
	name := strings.TrimSpace(id.Name)
	if name == "" {
		name = handle
	}
	user := storage.NewUser{Name: name, DisplayName: strings.ToLower(handle), Email: id.Email}
	if id.Picture != "" {
		user.AvatarURL = &id.Picture
	}
	return user
}

func firstName(name, email string) string {
	if fields := strings.Fields(name); len(fields) > 0 {
		return fields[0]
	}
	handle, _, _ := strings.Cut(email, "@")
	return handle
}

// teamKey is the name's first three ASCII letters, as Linear suggests.
func teamKey(name string) string {
	var key []rune
	for _, r := range strings.ToUpper(name) {
		if r < unicode.MaxASCII && unicode.IsLetter(r) && len(key) < 3 {
			key = append(key, r)
		}
	}
	if len(key) < 2 {
		return "TSK"
	}
	return string(key)
}

func slug(name string) string {
	var out []rune
	for _, r := range strings.ToLower(name) {
		if r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return "workspace"
	}
	return string(out)
}

func suffix() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
