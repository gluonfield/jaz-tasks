package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	authdb "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/auth"
	"github.com/jackc/pgx/v5"
)

func toAuthUser(r authdb.User) storage.User             { return storage.User(r) }
func toAPIKey(r authdb.APIKey) storage.APIKey           { return storage.APIKey(r) }
func toClient(r authdb.OAuthClient) storage.OAuthClient { return storage.OAuthClient(r) }
func toCode(r authdb.OAuthCode) storage.OAuthCode       { return storage.OAuthCode(r) }
func toGrant(r authdb.OAuthGrant) storage.OAuthGrant    { return storage.OAuthGrant(r) }
func toGrantSummary(r authdb.ListOAuthGrantsRow) storage.OAuthGrantSummary {
	return storage.OAuthGrantSummary(r)
}

func (s *Store) authTx(ctx context.Context, fn func(q *authdb.Queries) error) error {
	return mapError(pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		return fn(s.auth.WithTx(tx))
	}))
}

func (s *Store) UserByAPIKey(ctx context.Context, keyHash []byte) (storage.User, error) {
	return one(toAuthUser)(s.auth.UserByAPIKey(ctx, keyHash))
}

func (s *Store) CreateAPIKey(ctx context.Context, userID, label, hint string, keyHash []byte) (storage.APIKey, error) {
	return one(toAPIKey)(s.auth.CreateAPIKey(ctx, authdb.CreateAPIKeyParams{UserID: userID, Label: label, Hint: hint, KeyHash: keyHash}))
}

func (s *Store) APIKeys(ctx context.Context, userID string) ([]storage.APIKey, error) {
	return many(toAPIKey)(s.auth.ListAPIKeys(ctx, userID))
}

func (s *Store) DeleteAPIKey(ctx context.Context, userID, id string) error {
	return affected(s.auth.DeleteAPIKey(ctx, authdb.DeleteAPIKeyParams{UserID: userID, ID: id}))
}

func (s *Store) UsersByEmail(ctx context.Context, email string) ([]storage.User, error) {
	return many(toAuthUser)(s.auth.UsersByEmail(ctx, email))
}

func (s *Store) UserByID(ctx context.Context, id string) (storage.User, error) {
	return one(toAuthUser)(s.auth.GetUser(ctx, id))
}

func (s *Store) UserByIdentity(ctx context.Context, issuer, subject string) (storage.User, error) {
	return one(toAuthUser)(s.auth.UserByIdentity(ctx, authdb.UserByIdentityParams{Issuer: issuer, Subject: subject}))
}

func (s *Store) LinkIdentity(ctx context.Context, issuer, subject, userID string) error {
	return mapError(s.auth.LinkIdentity(ctx, authdb.LinkIdentityParams{Issuer: issuer, Subject: subject, UserID: userID}))
}

func (s *Store) CreateIdentityUser(ctx context.Context, user storage.NewUser, issuer, subject string, firstOnly bool) (storage.User, error) {
	var created authdb.User
	err := s.authTx(ctx, func(q *authdb.Queries) error {
		if err := q.LockSignUps(ctx); err != nil {
			return err
		}
		if firstOnly {
			if n, err := q.CountIdentities(ctx); err != nil || n > 0 {
				return firstErr(err, storage.ErrConflict)
			}
		}
		workspace, err := q.DefaultWorkspace(ctx)
		if err != nil {
			return err
		}
		user.WorkspaceID = workspace.ID
		if created, err = q.CreateAuthUser(ctx, authdb.CreateAuthUserParams(user)); err != nil {
			return err
		}
		return q.LinkIdentity(ctx, authdb.LinkIdentityParams{Issuer: issuer, Subject: subject, UserID: created.ID})
	})
	return one(toAuthUser)(created, err)
}

func (s *Store) DevUser(ctx context.Context) (storage.User, error) {
	return one(toAuthUser)(s.auth.DevUser(ctx))
}

func (s *Store) CreateSession(ctx context.Context, tokenHash []byte, userID string, expiresAt time.Time) error {
	return mapError(s.auth.CreateSession(ctx, authdb.CreateSessionParams{TokenHash: tokenHash, UserID: userID, ExpiresAt: expiresAt}))
}

func (s *Store) UserBySession(ctx context.Context, tokenHash []byte) (storage.User, error) {
	return one(toAuthUser)(s.auth.UserBySession(ctx, tokenHash))
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash []byte) error {
	return mapError(s.auth.DeleteSession(ctx, tokenHash))
}

func (s *Store) CreateOAuthClient(ctx context.Context, c storage.OAuthClient) (storage.OAuthClient, error) {
	return one(toClient)(s.auth.CreateOAuthClient(ctx, authdb.CreateOAuthClientParams{ID: c.ID, Name: c.Name, RedirectURIs: c.RedirectURIs}))
}

func (s *Store) OAuthClient(ctx context.Context, id string) (storage.OAuthClient, error) {
	return one(toClient)(s.auth.GetOAuthClient(ctx, id))
}

func (s *Store) CreateOAuthCode(ctx context.Context, code storage.OAuthCode) error {
	return mapError(s.auth.CreateOAuthCode(ctx, authdb.CreateOAuthCodeParams(code)))
}

func (s *Store) ConsumeOAuthCode(ctx context.Context, codeHash []byte) (storage.OAuthCode, error) {
	return one(toCode)(s.auth.ConsumeOAuthCode(ctx, codeHash))
}

func (s *Store) CreateOAuthGrant(ctx context.Context, clientID, userID, scope string, tokens []storage.NewOAuthToken) (storage.OAuthGrant, error) {
	var grant authdb.OAuthGrant
	err := s.authTx(ctx, func(q *authdb.Queries) error {
		var err error
		if grant, err = q.CreateOAuthGrant(ctx, authdb.CreateOAuthGrantParams{ClientID: clientID, UserID: userID, Scope: scope}); err != nil {
			return err
		}
		return insertTokens(ctx, q, grant.ID, tokens)
	})
	return one(toGrant)(grant, err)
}

func insertTokens(ctx context.Context, q *authdb.Queries, grantID string, tokens []storage.NewOAuthToken) error {
	for _, token := range tokens {
		token.GrantID = grantID
		if err := q.CreateOAuthToken(ctx, authdb.CreateOAuthTokenParams(token)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) OAuthToken(ctx context.Context, tokenHash []byte) (storage.OAuthToken, storage.OAuthGrant, error) {
	row, err := s.auth.GetOAuthToken(ctx, tokenHash)
	return storage.OAuthToken(row.OAuthToken), storage.OAuthGrant(row.OAuthGrant), mapError(err)
}

func (s *Store) RotateOAuthTokens(ctx context.Context, grantID string, usedHash []byte, tokens []storage.NewOAuthToken) error {
	err := s.authTx(ctx, func(q *authdb.Queries) error {
		if n, err := q.RevokeOAuthToken(ctx, usedHash); err != nil || n == 0 {
			return firstErr(err, storage.ErrReused)
		}
		if err := q.RevokeGrantTokens(ctx, grantID); err != nil {
			return err
		}
		return insertTokens(ctx, q, grantID, tokens)
	})
	if errors.Is(err, storage.ErrReused) {
		return firstErr(s.auth.RevokeGrantByID(ctx, grantID), storage.ErrReused)
	}
	return err
}

func (s *Store) RevokeOAuthToken(ctx context.Context, tokenHash []byte) error {
	_, err := s.auth.RevokeOAuthToken(ctx, tokenHash)
	return mapError(err)
}

func (s *Store) UserByAccessToken(ctx context.Context, tokenHash []byte) (storage.User, error) {
	return one(toAuthUser)(s.auth.UserByAccessToken(ctx, tokenHash))
}

func (s *Store) OAuthGrants(ctx context.Context, userID string) ([]storage.OAuthGrantSummary, error) {
	return many(toGrantSummary)(s.auth.ListOAuthGrants(ctx, userID))
}

func (s *Store) RevokeOAuthGrant(ctx context.Context, userID, grantID string) error {
	return affected(s.auth.RevokeOAuthGrant(ctx, authdb.RevokeOAuthGrantParams{ID: grantID, UserID: userID}))
}

// firstErr prefers a real error over the sentinel describing the outcome.
func firstErr(err, sentinel error) error {
	if err != nil {
		return err
	}
	return sentinel
}
