package gql

import (
	"context"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

func (organizationResolver) ProjectStatuses(ctx context.Context, obj *storage.Workspace) ([]tracker.ProjectStatus, error) {
	return tracker.ProjectStatuses, nil
}

func (organizationResolver) Teams(ctx context.Context, obj *storage.Workspace, after *string, filter *tracker.TeamFilter, first *int32, includeArchived *bool) (*TeamConnection, error) {
	return queryResolver{}.Teams(ctx, after, filter, first, includeArchived)
}

func (organizationResolver) UserCount(ctx context.Context, obj *storage.Workspace) (int32, error) {
	found, err := scope(ctx).Users(ctx)
	return int32(len(keepAll(found, func(u storage.User) bool { return u.Active }))), err
}

func (organizationResolver) Users(ctx context.Context, obj *storage.Workspace, after *string, filter *tracker.UserFilter, first *int32, includeDisabled *bool) (*UserConnection, error) {
	return users(ctx, filter, includeDisabled, all, after, first)
}

func (userResolver) AssignedIssues(ctx context.Context, obj *storage.User, after *string, filter *tracker.IssueFilter, first *int32, includeArchived *bool, orderBy *PaginationOrderBy) (*IssueConnection, error) {
	return issues(ctx, filter.WithAssignee(obj.ID), after, first, includeArchived, orderBy)
}

func (userResolver) CreatedIssues(ctx context.Context, obj *storage.User, after *string, filter *tracker.IssueFilter, first *int32, includeArchived *bool, orderBy *PaginationOrderBy) (*IssueConnection, error) {
	return issues(ctx, filter.WithCreator(obj.ID), after, first, includeArchived, orderBy)
}

func (userResolver) Guest(ctx context.Context, obj *storage.User) (bool, error) {
	return false, nil
}

func (userResolver) Initials(ctx context.Context, obj *storage.User) (string, error) {
	return initials(obj.Name), nil
}

func (userResolver) IsMe(ctx context.Context, obj *storage.User) (bool, error) {
	return obj.ID == scope(ctx).Actor().UserID, nil
}

// LastSeen is not tracked, so it stays unknown.
func (userResolver) LastSeen(ctx context.Context, obj *storage.User) (*time.Time, error) {
	return nil, nil
}

func (userResolver) Organization(ctx context.Context, obj *storage.User) (*storage.Workspace, error) {
	return ref(scope(ctx).Workspace(ctx))
}

func (userResolver) URL(ctx context.Context, obj *storage.User) (string, error) {
	return scope(ctx).URL("/profiles/" + obj.DisplayName), nil
}

func (teamResolver) ActiveCycle(ctx context.Context, obj *storage.Team) (*storage.Cycle, error) {
	cycles, err := scope(ctx).Cycles(ctx)
	if err != nil {
		return nil, err
	}
	now := scope(ctx).Now()
	i := slices.IndexFunc(cycles, func(c storage.Cycle) bool {
		return c.TeamID == obj.ID && c.ArchivedAt == nil && tracker.CycleActive(c, now)
	})
	if i < 0 {
		return nil, nil
	}
	return &cycles[i], nil
}

func (teamResolver) Cycles(ctx context.Context, obj *storage.Team, after *string, filter *tracker.CycleFilter, first *int32, includeArchived *bool) (*CycleConnection, error) {
	cycles, err := scope(ctx).FindCycles(ctx, filter, flag(includeArchived))
	return paged(keepAll(cycles, func(c storage.Cycle) bool { return c.TeamID == obj.ID }), err, after, first)
}

func (teamResolver) DisplayName(ctx context.Context, obj *storage.Team) (string, error) {
	return obj.Name, nil
}

func (teamResolver) Issues(ctx context.Context, obj *storage.Team, after *string, filter *tracker.IssueFilter, first *int32, includeArchived *bool, orderBy *PaginationOrderBy) (*IssueConnection, error) {
	return issues(ctx, filter.WithTeam(obj.ID), after, first, includeArchived, orderBy)
}

func (teamResolver) Labels(ctx context.Context, obj *storage.Team, after *string, filter *tracker.IssueLabelFilter, first *int32, includeArchived *bool) (*IssueLabelConnection, error) {
	labels, err := scope(ctx).FindIssueLabels(ctx, filter, flag(includeArchived))
	return paged(keepAll(labels, func(l storage.IssueLabel) bool { return deref(l.TeamID) == obj.ID }), err, after, first)
}

// Members are every workspace user: teams have no separate membership yet.
func (teamResolver) Members(ctx context.Context, obj *storage.Team, after *string, filter *tracker.UserFilter, first *int32, includeDisabled *bool) (*UserConnection, error) {
	return users(ctx, filter, includeDisabled, all, after, first)
}

func (teamResolver) Organization(ctx context.Context, obj *storage.Team) (*storage.Workspace, error) {
	return ref(scope(ctx).Workspace(ctx))
}

func (teamResolver) Projects(ctx context.Context, obj *storage.Team, after *string, filter *tracker.ProjectFilter, first *int32, includeArchived *bool) (*ProjectConnection, error) {
	projects, err := scope(ctx).FindProjects(ctx, filter, flag(includeArchived))
	return paged(keepAll(projects, func(p storage.Project) bool { return slices.Contains(p.TeamIDs, obj.ID) }), err, after, first)
}

func (teamResolver) States(ctx context.Context, obj *storage.Team, after *string, filter *tracker.WorkflowStateFilter, first *int32, includeArchived *bool) (*WorkflowStateConnection, error) {
	states, err := scope(ctx).FindWorkflowStates(ctx, filter, flag(includeArchived))
	return paged(keepAll(states, func(st storage.WorkflowState) bool { return st.TeamID == obj.ID }), err, after, first)
}

func (workflowStateResolver) Team(ctx context.Context, obj *storage.WorkflowState) (*storage.Team, error) {
	return ref(scope(ctx).Team(ctx, obj.TeamID))
}

func (issueLabelResolver) Children(ctx context.Context, obj *storage.IssueLabel, after *string, filter *tracker.IssueLabelFilter, first *int32, includeArchived *bool) (*IssueLabelConnection, error) {
	labels, err := scope(ctx).FindIssueLabels(ctx, filter, flag(includeArchived))
	return paged(keepAll(labels, func(l storage.IssueLabel) bool { return deref(l.ParentID) == obj.ID }), err, after, first)
}

func (issueLabelResolver) Parent(ctx context.Context, obj *storage.IssueLabel) (*storage.IssueLabel, error) {
	return lookup(ctx, obj.ParentID, scope(ctx).IssueLabel)
}

func (issueLabelResolver) Team(ctx context.Context, obj *storage.IssueLabel) (*storage.Team, error) {
	return lookup(ctx, obj.TeamID, scope(ctx).Team)
}

func (projectResolver) Issues(ctx context.Context, obj *storage.Project, after *string, filter *tracker.IssueFilter, first *int32, includeArchived *bool, orderBy *PaginationOrderBy) (*IssueConnection, error) {
	return issues(ctx, filter.WithProject(obj.ID), after, first, includeArchived, orderBy)
}

func (projectResolver) Lead(ctx context.Context, obj *storage.Project) (*storage.User, error) {
	return lookup(ctx, obj.LeadID, scope(ctx).User)
}

func (projectResolver) Progress(ctx context.Context, obj *storage.Project) (float64, error) {
	return scope(ctx).ProjectProgress(ctx, obj.ID)
}

func (projectResolver) State(ctx context.Context, obj *storage.Project) (string, error) {
	return tracker.ProjectStatusOf(*obj).Type, nil
}

func (projectResolver) Status(ctx context.Context, obj *storage.Project) (*tracker.ProjectStatus, error) {
	status := tracker.ProjectStatusOf(*obj)
	return &status, nil
}

func (projectResolver) Teams(ctx context.Context, obj *storage.Project, after *string, filter *tracker.TeamFilter, first *int32, includeArchived *bool) (*TeamConnection, error) {
	teams, err := scope(ctx).FindTeams(ctx, filter, flag(includeArchived))
	return paged(keepAll(teams, func(t storage.Team) bool { return slices.Contains(obj.TeamIDs, t.ID) }), err, after, first)
}

func (projectResolver) URL(ctx context.Context, obj *storage.Project) (string, error) {
	return scope(ctx).URL("/project/" + obj.SlugID), nil
}

func (cycleResolver) IsActive(ctx context.Context, obj *storage.Cycle) (bool, error) {
	return tracker.CycleActive(*obj, scope(ctx).Now()), nil
}

func (cycleResolver) IsFuture(ctx context.Context, obj *storage.Cycle) (bool, error) {
	return obj.StartsAt.After(scope(ctx).Now()), nil
}

func (cycleResolver) IsPast(ctx context.Context, obj *storage.Cycle) (bool, error) {
	return !obj.EndsAt.After(scope(ctx).Now()), nil
}

// IsNext marks the team's first future cycle.
func (cycleResolver) IsNext(ctx context.Context, obj *storage.Cycle) (bool, error) {
	return neighbour(ctx, obj, func(c storage.Cycle, now time.Time) bool { return c.StartsAt.After(now) }, false)
}

// IsPrevious marks the team's most recent past cycle.
func (cycleResolver) IsPrevious(ctx context.Context, obj *storage.Cycle) (bool, error) {
	return neighbour(ctx, obj, func(c storage.Cycle, now time.Time) bool { return !c.EndsAt.After(now) }, true)
}

func neighbour(ctx context.Context, obj *storage.Cycle, keep func(storage.Cycle, time.Time) bool, last bool) (bool, error) {
	cycles, err := scope(ctx).Cycles(ctx)
	if err != nil {
		return false, err
	}
	now := scope(ctx).Now()
	team := keepAll(cycles, func(c storage.Cycle) bool { return c.TeamID == obj.TeamID && c.ArchivedAt == nil && keep(c, now) })
	if len(team) == 0 {
		return false, nil
	}
	if last {
		return team[len(team)-1].ID == obj.ID, nil
	}
	return team[0].ID == obj.ID, nil
}

func (cycleResolver) Issues(ctx context.Context, obj *storage.Cycle, after *string, filter *tracker.IssueFilter, first *int32, includeArchived *bool, orderBy *PaginationOrderBy) (*IssueConnection, error) {
	return issues(ctx, filter.WithCycle(obj.ID), after, first, includeArchived, orderBy)
}

func (cycleResolver) Progress(ctx context.Context, obj *storage.Cycle) (float64, error) {
	return scope(ctx).CycleProgress(ctx, obj.ID)
}

func (cycleResolver) Team(ctx context.Context, obj *storage.Cycle) (*storage.Team, error) {
	return ref(scope(ctx).Team(ctx, obj.TeamID))
}

func (issueResolver) Assignee(ctx context.Context, obj *storage.Issue) (*storage.User, error) {
	return lookup(ctx, obj.AssigneeID, scope(ctx).User)
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func (r issueResolver) BranchName(ctx context.Context, obj *storage.Issue) (string, error) {
	identifier, err := r.Identifier(ctx, obj)
	slug := strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(obj.Title), "-"), "-")
	return strings.ToLower(identifier) + "-" + slug[:min(len(slug), 60)], err
}

func (issueResolver) Children(ctx context.Context, obj *storage.Issue, after *string, filter *tracker.IssueFilter, first *int32, includeArchived *bool, orderBy *PaginationOrderBy) (*IssueConnection, error) {
	return issues(ctx, filter.WithParent(obj.ID), after, first, includeArchived, orderBy)
}

func (issueResolver) Comments(ctx context.Context, obj *storage.Issue, after *string, first *int32) (*CommentConnection, error) {
	comments, err := scope(ctx).Comments(ctx, obj.ID)
	return paged(comments, err, after, first)
}

func (issueResolver) Creator(ctx context.Context, obj *storage.Issue) (*storage.User, error) {
	return lookup(ctx, obj.CreatorID, scope(ctx).User)
}

func (issueResolver) Cycle(ctx context.Context, obj *storage.Issue) (*storage.Cycle, error) {
	return lookup(ctx, obj.CycleID, scope(ctx).Cycle)
}

func (issueResolver) History(ctx context.Context, obj *storage.Issue, after *string, first *int32) (*IssueHistoryConnection, error) {
	history, err := scope(ctx).IssueHistory(ctx, obj.ID)
	return paged(history, err, after, first)
}

func (issueResolver) Identifier(ctx context.Context, obj *storage.Issue) (string, error) {
	return scope(ctx).Identifier(ctx, *obj)
}

func (issueResolver) Labels(ctx context.Context, obj *storage.Issue, after *string, filter *tracker.IssueLabelFilter, first *int32, includeArchived *bool) (*IssueLabelConnection, error) {
	labels, err := scope(ctx).FindIssueLabels(ctx, filter, true)
	return paged(keepAll(labels, func(l storage.IssueLabel) bool { return slices.Contains(obj.LabelIDs, l.ID) }), err, after, first)
}

func (issueResolver) Parent(ctx context.Context, obj *storage.Issue) (*storage.Issue, error) {
	return lookup(ctx, obj.ParentID, scope(ctx).Issue)
}

var priorityLabels = []string{"No priority", "Urgent", "High", "Medium", "Low"}

func (issueResolver) PriorityLabel(ctx context.Context, obj *storage.Issue) (string, error) {
	if int(obj.Priority) >= len(priorityLabels) {
		return "", fmt.Errorf("unknown priority %d", obj.Priority)
	}
	return priorityLabels[obj.Priority], nil
}

func (issueResolver) Project(ctx context.Context, obj *storage.Issue) (*storage.Project, error) {
	return lookup(ctx, obj.ProjectID, scope(ctx).Project)
}

func (issueResolver) State(ctx context.Context, obj *storage.Issue) (*storage.WorkflowState, error) {
	return ref(scope(ctx).WorkflowState(ctx, obj.StateID))
}

func (issueResolver) Team(ctx context.Context, obj *storage.Issue) (*storage.Team, error) {
	return ref(scope(ctx).Team(ctx, obj.TeamID))
}

func (r issueResolver) URL(ctx context.Context, obj *storage.Issue) (string, error) {
	identifier, err := r.Identifier(ctx, obj)
	return scope(ctx).URL("/issue/" + identifier), err
}

func (commentResolver) Issue(ctx context.Context, obj *storage.Comment) (*storage.Issue, error) {
	return ref(scope(ctx).Issue(ctx, obj.IssueID))
}

func (commentResolver) Parent(ctx context.Context, obj *storage.Comment) (*storage.Comment, error) {
	return lookup(ctx, obj.ParentID, scope(ctx).Comment)
}

func (commentResolver) URL(ctx context.Context, obj *storage.Comment) (string, error) {
	issue, err := scope(ctx).Issue(ctx, obj.IssueID)
	if err != nil {
		return "", err
	}
	identifier, err := scope(ctx).Identifier(ctx, issue)
	return scope(ctx).URL("/issue/" + identifier + "#comment-" + obj.ID), err
}

func (commentResolver) User(ctx context.Context, obj *storage.Comment) (*storage.User, error) {
	return lookup(ctx, obj.UserID, scope(ctx).User)
}

func (issueHistoryResolver) Actor(ctx context.Context, obj *storage.IssueHistory) (*storage.User, error) {
	return lookup(ctx, obj.ActorID, scope(ctx).User)
}

func (issueHistoryResolver) AddedLabels(ctx context.Context, obj *storage.IssueHistory) ([]storage.IssueLabel, error) {
	return historyLabels(ctx, obj.AddedLabelIDs)
}

func (issueHistoryResolver) RemovedLabels(ctx context.Context, obj *storage.IssueHistory) ([]storage.IssueLabel, error) {
	return historyLabels(ctx, obj.RemovedLabelIDs)
}

func historyLabels(ctx context.Context, ids []string) ([]storage.IssueLabel, error) {
	labels, err := scope(ctx).IssueLabels(ctx)
	return keepAll(labels, func(l storage.IssueLabel) bool { return slices.Contains(ids, l.ID) }), err
}

func (issueHistoryResolver) FromAssignee(ctx context.Context, obj *storage.IssueHistory) (*storage.User, error) {
	return lookup(ctx, obj.FromAssigneeID, scope(ctx).User)
}

func (issueHistoryResolver) ToAssignee(ctx context.Context, obj *storage.IssueHistory) (*storage.User, error) {
	return lookup(ctx, obj.ToAssigneeID, scope(ctx).User)
}

func (issueHistoryResolver) FromCycle(ctx context.Context, obj *storage.IssueHistory) (*storage.Cycle, error) {
	return lookup(ctx, obj.FromCycleID, scope(ctx).Cycle)
}

func (issueHistoryResolver) ToCycle(ctx context.Context, obj *storage.IssueHistory) (*storage.Cycle, error) {
	return lookup(ctx, obj.ToCycleID, scope(ctx).Cycle)
}

func (issueHistoryResolver) FromParent(ctx context.Context, obj *storage.IssueHistory) (*storage.Issue, error) {
	return lookup(ctx, obj.FromParentID, scope(ctx).Issue)
}

func (issueHistoryResolver) ToParent(ctx context.Context, obj *storage.IssueHistory) (*storage.Issue, error) {
	return lookup(ctx, obj.ToParentID, scope(ctx).Issue)
}

func (issueHistoryResolver) FromProject(ctx context.Context, obj *storage.IssueHistory) (*storage.Project, error) {
	return lookup(ctx, obj.FromProjectID, scope(ctx).Project)
}

func (issueHistoryResolver) ToProject(ctx context.Context, obj *storage.IssueHistory) (*storage.Project, error) {
	return lookup(ctx, obj.ToProjectID, scope(ctx).Project)
}

func (issueHistoryResolver) FromState(ctx context.Context, obj *storage.IssueHistory) (*storage.WorkflowState, error) {
	return lookup(ctx, obj.FromStateID, scope(ctx).WorkflowState)
}

func (issueHistoryResolver) ToState(ctx context.Context, obj *storage.IssueHistory) (*storage.WorkflowState, error) {
	return lookup(ctx, obj.ToStateID, scope(ctx).WorkflowState)
}

func (issueHistoryResolver) FromTeam(ctx context.Context, obj *storage.IssueHistory) (*storage.Team, error) {
	return lookup(ctx, obj.FromTeamID, scope(ctx).Team)
}

func (issueHistoryResolver) ToTeam(ctx context.Context, obj *storage.IssueHistory) (*storage.Team, error) {
	return lookup(ctx, obj.ToTeamID, scope(ctx).Team)
}

func (issueHistoryResolver) Issue(ctx context.Context, obj *storage.IssueHistory) (*storage.Issue, error) {
	return ref(scope(ctx).Issue(ctx, obj.IssueID))
}

func (issueHistoryResolver) UpdatedAt(ctx context.Context, obj *storage.IssueHistory) (*time.Time, error) {
	return &obj.CreatedAt, nil
}
