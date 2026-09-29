package postgres

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	db "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/tracker"
)

func (s *Store) CountWorkspaces(ctx context.Context) (int64, error) {
	return s.q.CountWorkspaces(ctx)
}

func (s *Store) Workspace(ctx context.Context, id string) (storage.Workspace, error) {
	return one(toWorkspace)(s.q.GetWorkspace(ctx, id))
}

func (s *Store) CreateWorkspace(ctx context.Context, name, urlKey string) (storage.Workspace, error) {
	return one(toWorkspace)(s.q.CreateWorkspace(ctx, db.CreateWorkspaceParams{Name: name, URLKey: urlKey}))
}

func (s *Store) Users(ctx context.Context, workspaceID string) ([]storage.User, error) {
	return many(toUser)(s.q.ListUsers(ctx, workspaceID))
}

func (s *Store) CreateUser(ctx context.Context, user storage.NewUser) (storage.User, error) {
	return one(toUser)(s.q.CreateUser(ctx, db.CreateUserParams(user)))
}

func (s *Store) Teams(ctx context.Context, workspaceID string) ([]storage.Team, error) {
	return many(toTeam)(s.q.ListTeams(ctx, workspaceID))
}

func (s *Store) CreateTeam(ctx context.Context, team storage.NewTeam, states []storage.NewWorkflowState) (storage.Team, error) {
	var created db.Team
	err := s.tx(ctx, func(q *db.Queries) error {
		var err error
		if created, err = q.CreateTeam(ctx, db.CreateTeamParams(team)); err != nil {
			return err
		}
		for _, state := range states {
			state.WorkspaceID = created.WorkspaceID
			state.TeamID = created.ID
			if _, err := q.CreateWorkflowState(ctx, db.CreateWorkflowStateParams(state)); err != nil {
				return err
			}
		}
		return nil
	})
	return one(toTeam)(created, err)
}

func (s *Store) WorkflowStates(ctx context.Context, workspaceID string) ([]storage.WorkflowState, error) {
	return many(toState)(s.q.ListWorkflowStates(ctx, workspaceID))
}

func (s *Store) CreateWorkflowState(ctx context.Context, state storage.NewWorkflowState) (storage.WorkflowState, error) {
	return one(toState)(s.q.CreateWorkflowState(ctx, db.CreateWorkflowStateParams(state)))
}

func (s *Store) IssueLabels(ctx context.Context, workspaceID string) ([]storage.IssueLabel, error) {
	return many(toLabel)(s.q.ListLabels(ctx, workspaceID))
}

func (s *Store) CreateIssueLabel(ctx context.Context, label storage.NewIssueLabel) (storage.IssueLabel, error) {
	return one(toLabel)(s.q.CreateLabel(ctx, db.CreateLabelParams(label)))
}

func (s *Store) UpdateIssueLabel(ctx context.Context, label storage.IssueLabel) (storage.IssueLabel, error) {
	return one(toLabel)(s.q.UpdateLabel(ctx, db.UpdateLabelParams{
		WorkspaceID: label.WorkspaceID,
		ID:          label.ID,
		ParentID:    label.ParentID,
		Name:        label.Name,
		Color:       label.Color,
		Description: label.Description,
	}))
}

func (s *Store) DeleteIssueLabel(ctx context.Context, workspaceID, id string) error {
	return s.tx(ctx, func(q *db.Queries) error {
		if err := q.RemoveLabelFromIssues(ctx, db.RemoveLabelFromIssuesParams{LabelID: id, WorkspaceID: workspaceID}); err != nil {
			return err
		}
		return affected(q.DeleteLabel(ctx, db.DeleteLabelParams{WorkspaceID: workspaceID, ID: id}))
	})
}

func (s *Store) Projects(ctx context.Context, workspaceID string) ([]storage.Project, error) {
	return many(toProject)(s.q.ListProjects(ctx, workspaceID))
}

func (s *Store) CreateProject(ctx context.Context, project storage.NewProject) (storage.Project, error) {
	return one(toProject)(s.q.CreateProject(ctx, db.CreateProjectParams(project)))
}

func (s *Store) UpdateProject(ctx context.Context, p storage.Project) (storage.Project, error) {
	return one(toProject)(s.q.UpdateProject(ctx, db.UpdateProjectParams{
		WorkspaceID: p.WorkspaceID,
		ID:          p.ID,
		Name:        p.Name,
		Description: p.Description,
		Icon:        p.Icon,
		Color:       p.Color,
		Status:      p.Status,
		LeadID:      p.LeadID,
		TeamIDs:     p.TeamIDs,
		Priority:    p.Priority,
		StartDate:   p.StartDate,
		TargetDate:  p.TargetDate,
		ArchivedAt:  p.ArchivedAt,
	}))
}

func (s *Store) Cycles(ctx context.Context, workspaceID string) ([]storage.Cycle, error) {
	return many(toCycle)(s.q.ListCycles(ctx, workspaceID))
}

func (s *Store) CreateCycle(ctx context.Context, cycle storage.NewCycle) (storage.Cycle, error) {
	return one(toCycle)(s.q.CreateCycle(ctx, db.CreateCycleParams(cycle)))
}
