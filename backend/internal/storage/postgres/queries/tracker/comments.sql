-- name: ListComments :many
SELECT * FROM comments WHERE workspace_id = $1 AND issue_id = $2 ORDER BY created_at, id;

-- name: GetComment :one
SELECT * FROM comments WHERE workspace_id = $1 AND id = $2;

-- name: CreateComment :one
INSERT INTO comments (workspace_id, issue_id, user_id, parent_id, body, id)
VALUES ($1, $2, $3, $4, $5, sqlc.arg(id))
RETURNING *;

-- name: UpdateComment :one
UPDATE comments SET body = $3, resolved_at = $4, edited_at = $5, updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: DeleteComment :execrows
DELETE FROM comments WHERE workspace_id = $1 AND id = $2;
