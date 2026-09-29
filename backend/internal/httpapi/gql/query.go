package gql

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

func (queryResolver) Viewer(ctx context.Context) (*storage.User, error) {
	return ref(scope(ctx).Viewer(ctx))
}

func (queryResolver) Organization(ctx context.Context) (*storage.Workspace, error) {
	return ref(scope(ctx).Workspace(ctx))
}

func (r queryResolver) OrganizationInvites(ctx context.Context, after *string, first *int32) (*OrganizationInviteConnection, error) {
	invites, err := r.members.Invites(ctx, scope(ctx).Actor())
	return paged(invites, err, after, first)
}

func (r queryResolver) Workspaces(ctx context.Context) ([]Membership, error) {
	actor := scope(ctx).Actor()
	memberships, err := r.members.Memberships(ctx, actor)
	if err != nil {
		return nil, err
	}
	out := make([]Membership, len(memberships))
	for i, m := range memberships {
		out[i] = Membership{ID: m.WorkspaceID, Name: m.Name, URLKey: m.URLKey, Current: m.UserID == actor.UserID}
	}
	return out, nil
}

func (queryResolver) User(ctx context.Context, id string) (*storage.User, error) {
	return ref(scope(ctx).User(ctx, id))
}

func (queryResolver) Users(ctx context.Context, after *string, filter *tracker.UserFilter, first *int32, includeDisabled *bool) (*UserConnection, error) {
	return users(ctx, filter, includeDisabled, all, after, first)
}

func (queryResolver) Team(ctx context.Context, id string) (*storage.Team, error) {
	return ref(scope(ctx).Team(ctx, id))
}

func (queryResolver) Teams(ctx context.Context, after *string, filter *tracker.TeamFilter, first *int32, includeArchived *bool) (*TeamConnection, error) {
	teams, err := scope(ctx).FindTeams(ctx, filter, flag(includeArchived))
	return paged(teams, err, after, first)
}

func (queryResolver) WorkflowState(ctx context.Context, id string) (*storage.WorkflowState, error) {
	return ref(scope(ctx).WorkflowState(ctx, id))
}

func (queryResolver) WorkflowStates(ctx context.Context, after *string, filter *tracker.WorkflowStateFilter, first *int32, includeArchived *bool) (*WorkflowStateConnection, error) {
	states, err := scope(ctx).FindWorkflowStates(ctx, filter, flag(includeArchived))
	return paged(states, err, after, first)
}

func (queryResolver) Issue(ctx context.Context, id string) (*storage.Issue, error) {
	return ref(scope(ctx).Issue(ctx, id))
}

func (queryResolver) Issues(ctx context.Context, after *string, filter *tracker.IssueFilter, first *int32, includeArchived *bool, orderBy *PaginationOrderBy) (*IssueConnection, error) {
	return issues(ctx, filter, after, first, includeArchived, orderBy)
}

func (queryResolver) SearchIssues(ctx context.Context, after *string, filter *tracker.IssueFilter, first *int32, includeArchived *bool, orderBy *PaginationOrderBy, teamID *string, term string) (*IssueSearchPayload, error) {
	if teamID != nil {
		team, err := scope(ctx).Team(ctx, *teamID)
		if err != nil {
			return nil, err
		}
		filter = filter.WithTeam(team.ID)
	}
	return ref(scope(ctx).Issues(ctx, tracker.IssueQuery{
		Filter:          filter,
		Search:          term,
		IncludeArchived: flag(includeArchived),
		OrderByUpdated:  orderBy != nil && *orderBy == PaginationOrderByUpdatedAt,
		PageArgs:        tracker.PageArgs{First: first, After: after},
	}))
}

func (queryResolver) IssueLabel(ctx context.Context, id string) (*storage.IssueLabel, error) {
	return ref(scope(ctx).IssueLabel(ctx, id))
}

func (queryResolver) IssueLabels(ctx context.Context, after *string, filter *tracker.IssueLabelFilter, first *int32, includeArchived *bool) (*IssueLabelConnection, error) {
	labels, err := scope(ctx).FindIssueLabels(ctx, filter, flag(includeArchived))
	return paged(labels, err, after, first)
}

func (queryResolver) Project(ctx context.Context, id string) (*storage.Project, error) {
	return ref(scope(ctx).Project(ctx, id))
}

func (queryResolver) Projects(ctx context.Context, after *string, filter *tracker.ProjectFilter, first *int32, includeArchived *bool) (*ProjectConnection, error) {
	projects, err := scope(ctx).FindProjects(ctx, filter, flag(includeArchived))
	return paged(projects, err, after, first)
}

func (queryResolver) Cycle(ctx context.Context, id string) (*storage.Cycle, error) {
	return ref(scope(ctx).Cycle(ctx, id))
}

func (queryResolver) Cycles(ctx context.Context, after *string, filter *tracker.CycleFilter, first *int32, includeArchived *bool) (*CycleConnection, error) {
	cycles, err := scope(ctx).FindCycles(ctx, filter, flag(includeArchived))
	return paged(cycles, err, after, first)
}

func (queryResolver) Comment(ctx context.Context, id *string) (*storage.Comment, error) {
	if id == nil {
		return nil, tracker.InvalidInputError{Message: "id is required"}
	}
	return ref(scope(ctx).Comment(ctx, *id))
}
