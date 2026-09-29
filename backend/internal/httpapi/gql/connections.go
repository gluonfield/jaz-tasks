package gql

import (
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

// Every Linear connection is a tracker page of its node type.
type (
	UserConnection          = tracker.Page[storage.User]
	TeamConnection          = tracker.Page[storage.Team]
	WorkflowStateConnection = tracker.Page[storage.WorkflowState]
	IssueLabelConnection    = tracker.Page[storage.IssueLabel]
	ProjectConnection       = tracker.Page[storage.Project]
	CycleConnection         = tracker.Page[storage.Cycle]
	IssueConnection         = tracker.Page[storage.Issue]
	IssueSearchPayload      = tracker.Page[storage.Issue]
	CommentConnection       = tracker.Page[storage.Comment]
	IssueHistoryConnection  = tracker.Page[storage.IssueHistory]
)
