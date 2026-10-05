-- name: ListIssues :many
SELECT issues.* FROM issues
WHERE issues.workspace_id = @workspace_id
  AND (@include_archived::bool OR issues.archived_at IS NULL)
  AND (sqlc.narg('ids')::text[] IS NULL OR issues.id = ANY(sqlc.narg('ids')::text[]))
  AND (sqlc.narg('team_ids')::text[] IS NULL OR team_id = ANY(sqlc.narg('team_ids')::text[]))
  AND (sqlc.narg('state_ids')::text[] IS NULL OR state_id = ANY(sqlc.narg('state_ids')::text[]))
  AND (sqlc.narg('priorities')::int[] IS NULL OR priority = ANY(sqlc.narg('priorities')::int[]))
  AND (sqlc.narg('assignee_ids')::text[] IS NULL OR assignee_id = ANY(sqlc.narg('assignee_ids')::text[])
    OR (@assignee_null::bool AND assignee_id IS NULL))
  AND (sqlc.narg('creator_ids')::text[] IS NULL OR creator_id = ANY(sqlc.narg('creator_ids')::text[])
    OR (@creator_null::bool AND creator_id IS NULL))
  AND (sqlc.narg('project_ids')::text[] IS NULL OR project_id = ANY(sqlc.narg('project_ids')::text[])
    OR (@project_null::bool AND project_id IS NULL))
  AND (sqlc.narg('cycle_ids')::text[] IS NULL OR cycle_id = ANY(sqlc.narg('cycle_ids')::text[])
    OR (@cycle_null::bool AND cycle_id IS NULL))
  AND (sqlc.narg('parent_ids')::text[] IS NULL OR parent_id = ANY(sqlc.narg('parent_ids')::text[])
    OR (@parent_null::bool AND parent_id IS NULL))
  AND (sqlc.narg('label_ids')::text[] IS NULL OR label_ids && sqlc.narg('label_ids')::text[]
    OR (@label_null::bool AND label_ids = '{}'))
  AND (@search::text = ''
    OR to_tsvector('simple', title || ' ' || COALESCE(description, '')) @@ to_tsquery('simple', @search::text)
    OR EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = issues.team_id AND teams.key || '-' || issues.number = @identifier::text
    ))
ORDER BY CASE WHEN @order_by_updated::bool THEN issues.updated_at ELSE issues.created_at END DESC, issues.id
LIMIT @row_limit OFFSET @row_offset;

-- name: GetIssue :one
SELECT * FROM issues WHERE workspace_id = $1 AND id = $2;

-- name: GetIssueByNumber :one
SELECT issues.* FROM issues
JOIN teams ON teams.id = issues.team_id
WHERE issues.workspace_id = @workspace_id AND upper(teams.key) = upper(@team_key::text) AND issues.number = @number;

-- name: LockIssue :one
SELECT * FROM issues WHERE workspace_id = $1 AND id = $2 FOR UPDATE;

-- name: CreateIssue :one
WITH next AS (
  UPDATE teams SET issue_count = issue_count + 1
  WHERE teams.id = @team_id::text AND teams.workspace_id = @workspace_id::text
  RETURNING issue_count
)
INSERT INTO issues (
  id, workspace_id, team_id, number, title, description, state_id, priority, estimate, assignee_id,
  creator_id, project_id, cycle_id, parent_id, label_ids, due_date, sort_order, started_at, completed_at, canceled_at
)
SELECT @id::text, @workspace_id::text, @team_id::text, next.issue_count, @title::text, sqlc.narg('description')::text,
  @state_id::text, @priority::int, sqlc.narg('estimate')::int, sqlc.narg('assignee_id')::text,
  sqlc.narg('creator_id')::text, sqlc.narg('project_id')::text, sqlc.narg('cycle_id')::text,
  sqlc.narg('parent_id')::text, @label_ids::text[], sqlc.narg('due_date')::date,
  COALESCE(sqlc.narg('sort_order')::float8, (SELECT COALESCE(min(sort_order), 0) - 1 FROM issues WHERE issues.team_id = @team_id::text)),
  sqlc.narg('started_at')::timestamptz, sqlc.narg('completed_at')::timestamptz, sqlc.narg('canceled_at')::timestamptz
FROM next
RETURNING *;

-- name: UpdateIssue :one
WITH next AS (
  UPDATE teams SET issue_count = issue_count + 1
  WHERE teams.id = @team_id::text AND teams.id <> (SELECT team_id FROM issues WHERE issues.id = @id::text)
  RETURNING issue_count
)
UPDATE issues SET
  team_id = @team_id::text,
  number = COALESCE((SELECT issue_count FROM next), number),
  title = @title::text,
  description = sqlc.narg('description')::text,
  state_id = @state_id::text,
  priority = @priority::int,
  estimate = sqlc.narg('estimate')::int,
  assignee_id = sqlc.narg('assignee_id')::text,
  project_id = sqlc.narg('project_id')::text,
  cycle_id = sqlc.narg('cycle_id')::text,
  parent_id = sqlc.narg('parent_id')::text,
  label_ids = @label_ids::text[],
  due_date = sqlc.narg('due_date')::date,
  sort_order = @sort_order::float8,
  started_at = sqlc.narg('started_at')::timestamptz,
  completed_at = sqlc.narg('completed_at')::timestamptz,
  canceled_at = sqlc.narg('canceled_at')::timestamptz,
  archived_at = sqlc.narg('archived_at')::timestamptz,
  updated_at = now()
WHERE issues.id = @id::text
RETURNING *;

-- name: DeleteIssue :execrows
DELETE FROM issues WHERE workspace_id = $1 AND id = $2;

-- name: ListIssueHistory :many
SELECT * FROM issue_history WHERE issue_id = $1 ORDER BY created_at, id;

-- name: CreateIssueHistory :exec
INSERT INTO issue_history (
  issue_id, actor_id, from_state_id, to_state_id, from_assignee_id, to_assignee_id, from_priority, to_priority,
  from_title, to_title, from_team_id, to_team_id, from_project_id, to_project_id, from_cycle_id, to_cycle_id, from_parent_id, to_parent_id,
  from_estimate, to_estimate, from_due_date, to_due_date, added_label_ids, removed_label_ids, updated_description, archived
, id) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
, sqlc.arg(id));

-- name: CountIssuesByState :many
SELECT issues.project_id, issues.cycle_id, workflow_states.type AS state_type, count(*) AS issues
FROM issues
JOIN workflow_states ON workflow_states.id = issues.state_id
WHERE issues.workspace_id = $1 AND issues.archived_at IS NULL
  AND (issues.project_id IS NOT NULL OR issues.cycle_id IS NOT NULL)
GROUP BY issues.project_id, issues.cycle_id, workflow_states.type;
