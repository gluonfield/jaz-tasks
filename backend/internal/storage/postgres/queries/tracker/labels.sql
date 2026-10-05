-- name: ListLabels :many
SELECT * FROM issue_labels WHERE workspace_id = $1 ORDER BY name;

-- name: CreateLabel :one
INSERT INTO issue_labels (workspace_id, team_id, parent_id, name, color, description, is_group, id)
VALUES ($1, $2, $3, $4, $5, $6, $7, sqlc.arg(id))
RETURNING *;

-- name: UpdateLabel :one
UPDATE issue_labels
SET parent_id = $3, name = $4, color = $5, description = $6, updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: DeleteLabel :execrows
DELETE FROM issue_labels WHERE workspace_id = $1 AND id = $2;

-- name: RemoveLabelFromIssues :exec
UPDATE issues SET label_ids = array_remove(label_ids, @label_id::text)
WHERE workspace_id = @workspace_id AND @label_id::text = ANY(label_ids);
