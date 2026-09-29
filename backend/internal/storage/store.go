package storage

import (
	"context"
	"errors"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("already exists")
	// ErrReused reports a rotated refresh token presented again; its grant is revoked.
	ErrReused = errors.New("token reused")
	// ErrUnexpected wraps storage failures callers should not show to users.
	ErrUnexpected = errors.New("unexpected storage error")
)

// IssueMutation edits a locked issue, reading (and locking) any other issue
// it needs through read, inside the same transaction. A nil history records
// nothing.
type IssueMutation func(prev Issue, read IssueReader) (Issue, *NewIssueHistory, error)

type IssueReader func(ctx context.Context, id string) (Issue, error)

type TrackerStore interface {
	CountWorkspaces(ctx context.Context) (int64, error)
	Workspace(ctx context.Context, id string) (Workspace, error)
	CreateWorkspace(ctx context.Context, name, urlKey string) (Workspace, error)
	UpdateWorkspace(ctx context.Context, workspace Workspace) (Workspace, error)
	Users(ctx context.Context, workspaceID string) ([]User, error)
	CreateUser(ctx context.Context, user NewUser) (User, error)

	Teams(ctx context.Context, workspaceID string) ([]Team, error)
	CreateTeam(ctx context.Context, team NewTeam, states []NewWorkflowState) (Team, error)
	UpdateTeam(ctx context.Context, team Team) (Team, error)
	WorkflowStates(ctx context.Context, workspaceID string) ([]WorkflowState, error)
	CreateWorkflowState(ctx context.Context, state NewWorkflowState) (WorkflowState, error)

	IssueLabels(ctx context.Context, workspaceID string) ([]IssueLabel, error)
	CreateIssueLabel(ctx context.Context, label NewIssueLabel) (IssueLabel, error)
	UpdateIssueLabel(ctx context.Context, label IssueLabel) (IssueLabel, error)
	DeleteIssueLabel(ctx context.Context, workspaceID, id string) error

	Projects(ctx context.Context, workspaceID string) ([]Project, error)
	CreateProject(ctx context.Context, project NewProject) (Project, error)
	UpdateProject(ctx context.Context, project Project) (Project, error)
	Cycles(ctx context.Context, workspaceID string) ([]Cycle, error)
	CreateCycle(ctx context.Context, cycle NewCycle) (Cycle, error)

	Issues(ctx context.Context, query IssueQuery) ([]Issue, error)
	Issue(ctx context.Context, workspaceID, id string) (Issue, error)
	IssueByNumber(ctx context.Context, workspaceID, teamKey string, number int32) (Issue, error)
	CreateIssues(ctx context.Context, issues []NewIssue) ([]Issue, error)
	UpdateIssue(ctx context.Context, workspaceID, id string, mutate IssueMutation) (Issue, error)
	DeleteIssue(ctx context.Context, workspaceID, id string) error
	IssueHistory(ctx context.Context, issueID string) ([]IssueHistory, error)
	CountIssuesByState(ctx context.Context, workspaceID string) ([]IssueCount, error)

	Comments(ctx context.Context, workspaceID, issueID string) ([]Comment, error)
	Comment(ctx context.Context, workspaceID, id string) (Comment, error)
	CreateComment(ctx context.Context, comment NewComment) (Comment, error)
	UpdateComment(ctx context.Context, comment Comment) (Comment, error)
	DeleteComment(ctx context.Context, workspaceID, id string) error
}
