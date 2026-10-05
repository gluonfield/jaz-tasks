-- name: ListTeams :many
SELECT * FROM teams WHERE workspace_id = $1 ORDER BY name;

-- name: CreateTeam :one
INSERT INTO teams (workspace_id, key, name, description, icon, color, id)
VALUES ($1, $2, $3, $4, $5, $6, sqlc.arg(id))
RETURNING *;

-- name: UpdateTeam :one
UPDATE teams SET name = $3, updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: ListWorkflowStates :many
SELECT * FROM workflow_states WHERE workspace_id = $1 ORDER BY team_id, position;

-- name: CreateWorkflowState :one
INSERT INTO workflow_states (workspace_id, team_id, name, type, color, position, description, id)
VALUES ($1, $2, $3, $4, $5, $6, $7, sqlc.arg(id))
RETURNING *;
