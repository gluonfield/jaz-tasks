package postgres

import (
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	authdb "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/auth"
	db "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/tracker"
)

func toWorkspace(r db.Workspace) storage.Workspace          { return storage.Workspace(r) }
func toUser(r db.User) storage.User                         { return storage.User(r) }
func toAuthUser(r authdb.User) storage.User                 { return storage.User(r) }
func toTeam(r db.Team) storage.Team                         { return storage.Team(r) }
func toState(r db.WorkflowState) storage.WorkflowState      { return storage.WorkflowState(r) }
func toLabel(r db.IssueLabel) storage.IssueLabel            { return storage.IssueLabel(r) }
func toProject(r db.Project) storage.Project                { return storage.Project(r) }
func toCycle(r db.Cycle) storage.Cycle                      { return storage.Cycle(r) }
func toIssue(r db.Issue) storage.Issue                      { return storage.Issue(r) }
func toComment(r db.Comment) storage.Comment                { return storage.Comment(r) }
func toCount(r db.CountIssuesByStateRow) storage.IssueCount { return storage.IssueCount(r) }
func toHistory(r db.IssueHistory) storage.IssueHistory      { return storage.IssueHistory(r) }
