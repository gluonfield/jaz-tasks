-- name: ListProjects :many
SELECT * FROM projects WHERE workspace_id = $1 ORDER BY sort_order, name;

-- name: CreateProject :one
INSERT INTO projects (workspace_id, name, description, icon, color, status, lead_id, team_ids, priority, start_date, target_date, content, id, slug_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, sqlc.arg(id), sqlc.arg(id))
RETURNING *;

-- name: UpdateProject :one
UPDATE projects
SET name = $3, description = $4, icon = $5, color = $6, status = $7, lead_id = $8, team_ids = $9,
  priority = $10, start_date = $11, target_date = $12, archived_at = $13, content = $14, updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: ListCycles :many
SELECT * FROM cycles WHERE workspace_id = $1 ORDER BY team_id, number;

-- name: CreateCycle :one
INSERT INTO cycles (workspace_id, team_id, number, name, description, starts_at, ends_at, id)
SELECT @workspace_id::text, @team_id::text, COALESCE(max(number), 0) + 1, sqlc.narg('name')::text,
  sqlc.narg('description')::text, @starts_at::timestamptz, @ends_at::timestamptz, sqlc.arg(id)::text
FROM cycles WHERE team_id = @team_id::text
RETURNING *;
