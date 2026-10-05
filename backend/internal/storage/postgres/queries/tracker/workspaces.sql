-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = $1;

-- name: CountWorkspaces :one
SELECT count(*) FROM workspaces;

-- name: CreateWorkspace :one
INSERT INTO workspaces (name, url_key, id) VALUES ($1, $2, sqlc.arg(id)) RETURNING *;

-- name: UpdateWorkspace :one
UPDATE workspaces SET name = $2, updated_at = now() WHERE id = $1 RETURNING *;

-- name: ListUsers :many
SELECT * FROM users WHERE workspace_id = $1 ORDER BY name;

-- name: CreateUser :one
INSERT INTO users (workspace_id, name, display_name, email, avatar_url, admin, id)
VALUES ($1, $2, $3, $4, $5, $6, sqlc.arg(id))
RETURNING *;
