-- name: ListSavedViews :many
SELECT * FROM saved_views WHERE workspace_id = @workspace_id ORDER BY name, id;

-- name: LockSavedView :one
SELECT * FROM saved_views WHERE workspace_id = @workspace_id AND id = @id FOR UPDATE;

-- name: CreateSavedView :one
INSERT INTO saved_views (id, workspace_id, name, team_id, label_ids, layout, grouping, ordering, completed_filter, show_empty, due_date_filter)
VALUES (@id, @workspace_id, @name, @team_id, @label_ids::text[], @layout, @grouping, @ordering, @completed_filter, @show_empty, @due_date_filter)
RETURNING *;

-- name: UpdateSavedView :one
UPDATE saved_views
SET name = @name, team_id = @team_id, label_ids = @label_ids::text[], layout = @layout,
    grouping = @grouping, ordering = @ordering, completed_filter = @completed_filter, show_empty = @show_empty, due_date_filter = @due_date_filter
WHERE workspace_id = @workspace_id AND id = @id
RETURNING *;

-- name: DeleteSavedView :execrows
DELETE FROM saved_views WHERE workspace_id = @workspace_id AND id = @id;
