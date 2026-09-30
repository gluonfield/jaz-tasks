package postgres

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	authdb "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/auth"
	db "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/tracker"
	"github.com/jackc/pgx/v5"
)

func toIdentity(r authdb.Identity) storage.Identity             { return storage.Identity(r) }
func toInvite(r authdb.WorkspaceInvite) storage.WorkspaceInvite { return storage.WorkspaceInvite(r) }
func toMembership(r authdb.MembershipsRow) storage.Membership   { return storage.Membership(r) }

// both runs fn with the tracker and auth queries bound to one transaction.
func (s *Store) both(ctx context.Context, fn func(q *db.Queries, a *authdb.Queries) error) error {
	return mapError(pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		return fn(s.q.WithTx(tx), s.auth.WithTx(tx))
	}))
}

func (s *Store) UsersByIdentity(ctx context.Context, issuer, subject string) ([]storage.User, error) {
	return many(toAuthUser)(s.auth.UsersByIdentity(ctx, authdb.UsersByIdentityParams{Issuer: issuer, Subject: subject}))
}

func (s *Store) ShareIdentity(ctx context.Context, from, identity storage.Identity) ([]storage.User, error) {
	return many(toAuthUser)(s.auth.ShareIdentity(ctx, authdb.ShareIdentityParams{
		Issuer: identity.Issuer, Subject: identity.Subject, FromIssuer: from.Issuer, FromSubject: from.Subject,
	}))
}

func (s *Store) UserIdentity(ctx context.Context, userID string) (storage.Identity, error) {
	return one(toIdentity)(s.auth.UserIdentity(ctx, userID))
}

func (s *Store) Memberships(ctx context.Context, userID string) ([]storage.Membership, error) {
	return many(toMembership)(s.auth.Memberships(ctx, userID))
}

func (s *Store) CreateOwnedWorkspace(ctx context.Context, workspace storage.NewWorkspace, owner storage.NewUser, identity storage.Identity, team storage.NewTeam, states []storage.NewWorkflowState) (storage.User, error) {
	var user authdb.User
	err := s.both(ctx, func(q *db.Queries, a *authdb.Queries) error {
		created, err := q.CreateWorkspace(ctx, db.CreateWorkspaceParams(workspace))
		if err != nil {
			return err
		}
		owner.WorkspaceID = created.ID
		if user, err = a.CreateAuthUser(ctx, authdb.CreateAuthUserParams(owner)); err != nil {
			return err
		}
		if err := a.LinkIdentity(ctx, authdb.LinkIdentityParams{Issuer: identity.Issuer, Subject: identity.Subject, UserID: user.ID}); err != nil {
			return err
		}
		team.WorkspaceID = created.ID
		_, err = createTeam(ctx, q, team, states)
		return err
	})
	return one(toAuthUser)(user, err)
}

func (s *Store) JoinWorkspace(ctx context.Context, invite storage.WorkspaceInvite, member storage.NewUser, identity storage.Identity) (storage.User, error) {
	var user authdb.User
	err := s.both(ctx, func(_ *db.Queries, a *authdb.Queries) error {
		if err := affected(a.DeleteInvite(ctx, authdb.DeleteInviteParams{WorkspaceID: invite.WorkspaceID, ID: invite.ID})); err != nil {
			return err
		}
		member.WorkspaceID = invite.WorkspaceID
		var err error
		if user, err = a.CreateAuthUser(ctx, authdb.CreateAuthUserParams(member)); err != nil {
			return err
		}
		return a.LinkIdentity(ctx, authdb.LinkIdentityParams{Issuer: identity.Issuer, Subject: identity.Subject, UserID: user.ID})
	})
	return one(toAuthUser)(user, err)
}

func (s *Store) CreateInvite(ctx context.Context, workspaceID, email, invitedBy string) (storage.WorkspaceInvite, error) {
	return one(toInvite)(s.auth.CreateInvite(ctx, authdb.CreateInviteParams{WorkspaceID: workspaceID, Email: email, InvitedBy: &invitedBy}))
}

func (s *Store) Invites(ctx context.Context, workspaceID string) ([]storage.WorkspaceInvite, error) {
	return many(toInvite)(s.auth.ListInvites(ctx, workspaceID))
}

func (s *Store) InvitesByEmail(ctx context.Context, email string) ([]storage.WorkspaceInvite, error) {
	return many(toInvite)(s.auth.InvitesByEmail(ctx, email))
}

func (s *Store) DeleteInvite(ctx context.Context, workspaceID, id string) error {
	return affected(s.auth.DeleteInvite(ctx, authdb.DeleteInviteParams{WorkspaceID: workspaceID, ID: id}))
}
