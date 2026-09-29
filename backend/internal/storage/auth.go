package storage

import (
	"context"
	"time"
)

type APIKey struct {
	ID        string
	UserID    string
	Label     string
	KeyHash   []byte
	CreatedAt time.Time
	Hint      string
}

type OAuthClient struct {
	ID           string
	Name         string
	RedirectURIs []string
	CreatedAt    time.Time
}

type OAuthCode struct {
	CodeHash      []byte
	ClientID      string
	UserID        string
	RedirectURI   string
	CodeChallenge string
	Scope         string
	ExpiresAt     time.Time
}

type OAuthGrant struct {
	ID        string
	ClientID  string
	UserID    string
	Scope     string
	CreatedAt time.Time
	RevokedAt *time.Time
}

type OAuthToken struct {
	TokenHash []byte
	GrantID   string
	Kind      string
	CreatedAt time.Time
	ExpiresAt time.Time
	RevokedAt *time.Time
}

// OAuthGrantSummary is an authorized application as its user sees it.
type OAuthGrantSummary struct {
	ID         string
	ClientName string
	CreatedAt  time.Time
	LastUsedAt time.Time
}

type NewOAuthToken struct {
	TokenHash []byte
	GrantID   string
	Kind      string
	ExpiresAt time.Time
}

type AuthStore interface {
	UserByAPIKey(ctx context.Context, keyHash []byte) (User, error)
	CreateAPIKey(ctx context.Context, userID, label, hint string, keyHash []byte) (APIKey, error)
	APIKeys(ctx context.Context, userID string) ([]APIKey, error)
	DeleteAPIKey(ctx context.Context, userID, id string) error
	UsersByEmail(ctx context.Context, email string) ([]User, error)
	UserByID(ctx context.Context, id string) (User, error)
	Workspace(ctx context.Context, id string) (Workspace, error)

	DevUser(ctx context.Context) (User, error)

	CreateSession(ctx context.Context, tokenHash []byte, userID string, expiresAt time.Time) error
	UpdateSessionUser(ctx context.Context, tokenHash []byte, userID string) error
	UserBySession(ctx context.Context, tokenHash []byte) (User, error)
	DeleteSession(ctx context.Context, tokenHash []byte) error

	CreateOAuthClient(ctx context.Context, client OAuthClient) (OAuthClient, error)
	OAuthClient(ctx context.Context, id string) (OAuthClient, error)
	CreateOAuthCode(ctx context.Context, code OAuthCode) error
	// ConsumeOAuthCode deletes and returns a code, so it works exactly once.
	ConsumeOAuthCode(ctx context.Context, codeHash []byte) (OAuthCode, error)
	// CreateOAuthGrant starts a grant with its first tokens.
	CreateOAuthGrant(ctx context.Context, clientID, userID, scope string, tokens []NewOAuthToken) (OAuthGrant, error)
	OAuthToken(ctx context.Context, tokenHash []byte) (OAuthToken, OAuthGrant, error)
	// RotateOAuthTokens revokes the used token and every live token of its
	// grant, then issues replacements; a used token already revoked returns
	// ErrReused after revoking the grant.
	RotateOAuthTokens(ctx context.Context, grantID string, usedHash []byte, tokens []NewOAuthToken) error
	// RevokeOAuthToken revokes a token; a refresh token takes every token of
	// its grant with it (RFC 7009).
	RevokeOAuthToken(ctx context.Context, tokenHash []byte) error
	// UserByAccessToken also returns the grant the token belongs to.
	UserByAccessToken(ctx context.Context, tokenHash []byte) (User, string, error)
	UpdateOAuthGrantUser(ctx context.Context, grantID, userID string) error
	OAuthGrants(ctx context.Context, userID string) ([]OAuthGrantSummary, error)
	RevokeOAuthGrant(ctx context.Context, userID, grantID string) error
}

// Identity links a person's OIDC subject to one user row per workspace.
type Identity struct {
	Issuer    string
	Subject   string
	UserID    string
	CreatedAt time.Time
}

type WorkspaceInvite struct {
	ID          string
	WorkspaceID string
	Email       string
	InvitedBy   *string
	CreatedAt   time.Time
}

// Membership is one workspace a person belongs to, through one user row.
type Membership struct {
	UserID      string
	WorkspaceID string
	Name        string
	URLKey      string
}

type NewWorkspace struct {
	Name   string
	URLKey string
}

type WorkspaceStore interface {
	UserByID(ctx context.Context, id string) (User, error)
	UsersByIdentity(ctx context.Context, issuer, subject string) ([]User, error)
	UserIdentity(ctx context.Context, userID string) (Identity, error)
	// Memberships lists the workspaces of everyone sharing the user's identity.
	Memberships(ctx context.Context, userID string) ([]Membership, error)
	// CreateOwnedWorkspace creates a workspace, its owner linked to the
	// identity, and a first team with its workflow, atomically.
	CreateOwnedWorkspace(ctx context.Context, workspace NewWorkspace, owner NewUser, identity Identity, team NewTeam, states []NewWorkflowState) (User, error)
	// JoinWorkspace turns an invite into a member linked to the identity.
	JoinWorkspace(ctx context.Context, invite WorkspaceInvite, member NewUser, identity Identity) (User, error)
	CreateInvite(ctx context.Context, workspaceID, email, invitedBy string) (WorkspaceInvite, error)
	Invites(ctx context.Context, workspaceID string) ([]WorkspaceInvite, error)
	InvitesByEmail(ctx context.Context, email string) ([]WorkspaceInvite, error)
	DeleteInvite(ctx context.Context, workspaceID, id string) error
}
