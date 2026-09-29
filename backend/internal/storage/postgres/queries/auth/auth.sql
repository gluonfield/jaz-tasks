-- name: UserByAPIKey :one
SELECT users.* FROM api_keys
JOIN users ON users.id = api_keys.user_id
WHERE api_keys.key_hash = $1 AND users.active;

-- name: CreateAPIKey :one
INSERT INTO api_keys (user_id, label, hint, key_hash) VALUES ($1, $2, $3, $4) RETURNING *;

-- name: ListAPIKeys :many
SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC;

-- name: DeleteAPIKey :execrows
DELETE FROM api_keys WHERE user_id = $1 AND id = $2;

-- name: UsersByEmail :many
SELECT * FROM users WHERE lower(email) = lower($1) AND active;

-- name: DevUser :one
SELECT users.* FROM users
JOIN workspaces ON workspaces.id = users.workspace_id
WHERE users.admin AND users.active
ORDER BY workspaces.created_at, users.created_at
LIMIT 1;

-- name: CreateAuthUser :one
INSERT INTO users (workspace_id, name, display_name, email, avatar_url, admin)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: LinkIdentity :exec
INSERT INTO identities (issuer, subject, user_id) VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3);

-- name: UserBySession :one
SELECT users.* FROM sessions
JOIN users ON users.id = sessions.user_id
WHERE sessions.token_hash = $1 AND sessions.expires_at > now() AND users.active;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = $1;

-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: UsersByIdentity :many
SELECT users.* FROM identities
JOIN users ON users.id = identities.user_id
WHERE identities.issuer = $1 AND identities.subject = $2 AND users.active
ORDER BY users.created_at;

-- name: UserIdentity :one
SELECT * FROM identities WHERE user_id = $1 LIMIT 1;

-- name: Memberships :many
SELECT users.id AS user_id, workspaces.id AS workspace_id, workspaces.name, workspaces.url_key
FROM users
JOIN workspaces ON workspaces.id = users.workspace_id
WHERE users.active AND (users.id = @user_id OR users.id IN (
  SELECT other.user_id FROM identities mine
  JOIN identities other ON other.issuer = mine.issuer AND other.subject = mine.subject
  WHERE mine.user_id = @user_id
))
ORDER BY workspaces.created_at;

-- name: UpdateSessionUser :execrows
UPDATE sessions SET user_id = $2 WHERE token_hash = $1;

-- name: CreateInvite :one
INSERT INTO workspace_invites (workspace_id, email, invited_by) VALUES ($1, lower(@email::text), $2)
RETURNING *;

-- name: ListInvites :many
SELECT * FROM workspace_invites WHERE workspace_id = $1 ORDER BY created_at DESC;

-- name: InvitesByEmail :many
SELECT * FROM workspace_invites WHERE email = lower(@email::text);

-- name: DeleteInvite :execrows
DELETE FROM workspace_invites WHERE workspace_id = $1 AND id = $2;
