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

-- name: DefaultWorkspace :one
SELECT * FROM workspaces ORDER BY created_at LIMIT 1;

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

-- name: LockSignUps :exec
SELECT pg_advisory_xact_lock(7400);

-- name: CountIdentities :one
SELECT count(*) FROM identities;

-- name: UserByIdentity :one
SELECT users.* FROM identities
JOIN users ON users.id = identities.user_id
WHERE identities.issuer = $1 AND identities.subject = $2 AND users.active;

-- name: LinkIdentity :exec
INSERT INTO identities (issuer, subject, user_id) VALUES ($1, $2, $3)
ON CONFLICT (issuer, subject) DO UPDATE SET user_id = excluded.user_id;

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
