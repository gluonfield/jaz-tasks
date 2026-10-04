-- name: ListInbox :many
SELECT sqlc.embed(issues), activity.updated_at::timestamptz AS activity_at
FROM issues
JOIN LATERAL (
  SELECT greatest(issues.updated_at, max(comments.updated_at)) AS updated_at
  FROM comments WHERE comments.issue_id = issues.id
) activity ON true
LEFT JOIN inbox_dismissals ON inbox_dismissals.issue_id = issues.id AND inbox_dismissals.user_id = @user_id::uuid
WHERE issues.workspace_id = @workspace_id::uuid AND issues.archived_at IS NULL
  AND (issues.assignee_id = @user_id::uuid OR issues.creator_id = @user_id::uuid)
  AND (inbox_dismissals.updated_through IS NULL OR activity.updated_at > inbox_dismissals.updated_through)
ORDER BY activity.updated_at DESC, issues.id;

-- name: DismissInboxUpdate :execrows
INSERT INTO inbox_dismissals (user_id, issue_id, updated_through)
SELECT @user_id::uuid, issues.id, @updated_through::timestamptz
FROM issues
WHERE issues.id = @issue_id::uuid AND issues.workspace_id = @workspace_id::uuid
  AND (issues.assignee_id = @user_id::uuid OR issues.creator_id = @user_id::uuid)
  AND @updated_through::timestamptz <= greatest(issues.updated_at, (SELECT max(updated_at) FROM comments WHERE issue_id = issues.id))
ON CONFLICT (user_id, issue_id) DO UPDATE
SET updated_through = greatest(inbox_dismissals.updated_through, excluded.updated_through);
