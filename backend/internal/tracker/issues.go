package tracker

import (
	"context"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

type IssueQuery struct {
	Filter          *IssueFilter
	Search          string
	IncludeArchived bool
	OrderByUpdated  bool
	PageArgs
}

func (s *Scope) Issues(ctx context.Context, q IssueQuery) (Page[storage.Issue], error) {
	offset, limit, err := q.bounds()
	if err != nil {
		return Page[storage.Issue]{}, err
	}
	query, err := s.issueQuery(ctx, q.Filter)
	if err != nil {
		return Page[storage.Issue]{}, err
	}
	if q.Search != "" {
		query.Search = q.Search
	}
	query.IncludeArchived = q.IncludeArchived
	query.OrderByUpdated = q.OrderByUpdated
	query.Offset = int32(offset)
	query.Limit = int32(limit + 1)
	issues, err := s.svc.store.Issues(ctx, query)
	if err != nil {
		return Page[storage.Issue]{}, err
	}
	return page(issues, offset, limit), nil
}

func (s *Scope) issueQuery(ctx context.Context, f *IssueFilter) (storage.IssueQuery, error) {
	q := storage.IssueQuery{WorkspaceID: s.actor.WorkspaceID}
	if f == nil {
		return q, nil
	}
	var err error
	if f.ID != nil {
		if q.IDs, err = f.ID.exact(); err != nil {
			return q, err
		}
	}
	if f.Priority != nil {
		q.Priorities = []int32{}
		for p := range int32(5) {
			if f.Priority.match(float64(p)) {
				q.Priorities = append(q.Priorities, p)
			}
		}
	}
	if f.Team != nil || f.State != nil || f.Cycle != nil || f.Labels != nil {
		teams, err := s.Teams(ctx)
		if err != nil {
			return q, err
		}
		if f.Team != nil {
			q.TeamIDs = keys(s.teamIDs(teams, f.Team))
		}
		if f.State != nil {
			states, err := s.WorkflowStates(ctx)
			if err != nil {
				return q, err
			}
			stateTeams := s.teamIDs(teams, f.State.Team)
			q.StateIDs = keys(idSet(states, func(st storage.WorkflowState) (string, bool) {
				return st.ID, s.matchState(f.State, st, stateTeams)
			}))
		}
		if f.Cycle != nil {
			cycles, err := s.Cycles(ctx)
			if err != nil {
				return q, err
			}
			cycleTeams, now := s.teamIDs(teams, f.Cycle.Team), s.svc.now()
			q.CycleIDs, q.CycleNull = reference(f.Cycle.Null, idSet(cycles, func(c storage.Cycle) (string, bool) {
				return c.ID, s.matchCycle(f.Cycle, c, cycleTeams, now)
			}))
		}
		if f.Labels != nil {
			if q.LabelIDs, q.LabelNull, err = s.labelReference(ctx, f.Labels, teams); err != nil {
				return q, err
			}
		}
	}
	if f.Assignee != nil {
		if q.AssigneeIDs, q.AssigneeNull, err = s.userReference(ctx, f.Assignee); err != nil {
			return q, err
		}
	}
	if f.Creator != nil {
		if q.CreatorIDs, q.CreatorNull, err = s.userReference(ctx, f.Creator); err != nil {
			return q, err
		}
	}
	if f.Project != nil {
		projects, err := s.Projects(ctx)
		if err != nil {
			return q, err
		}
		users, err := s.Users(ctx)
		if err != nil {
			return q, err
		}
		q.ProjectIDs, q.ProjectNull = reference(f.Project.Null, idSet(projects, func(p storage.Project) (string, bool) {
			return p.ID, s.matchProject(f.Project, p, users)
		}))
	}
	if f.Parent != nil {
		if f.Parent.Null != nil && *f.Parent.Null {
			q.ParentIDs, q.ParentNull = []string{}, true
		} else if f.Parent.ID != nil {
			if q.ParentIDs, err = f.Parent.ID.exact(); err != nil {
				return q, err
			}
		}
	}
	if f.SearchableContent != nil && f.SearchableContent.Contains != nil {
		q.Search = *f.SearchableContent.Contains
	}
	return q, nil
}

func (s *Scope) userReference(ctx context.Context, f *UserFilter) ([]string, bool, error) {
	users, err := s.Users(ctx)
	if err != nil {
		return nil, false, err
	}
	ids, null := reference(f.Null, idSet(users, func(u storage.User) (string, bool) {
		return u.ID, f.match(u, s.actor.UserID)
	}))
	return ids, null, nil
}

func (s *Scope) labelReference(ctx context.Context, f *IssueLabelFilter, teams []storage.Team) ([]string, bool, error) {
	labels, err := s.IssueLabels(ctx)
	if err != nil {
		return nil, false, err
	}
	match := func(f *IssueLabelFilter) map[string]bool {
		labelTeams := s.teamIDs(teams, f.Team)
		return idSet(labels, func(l storage.IssueLabel) (string, bool) {
			return l.ID, s.matchLabel(f, l, labels, labelTeams)
		})
	}
	matched := match(f)
	if f.Some != nil {
		some := match(f.Some)
		for id := range matched {
			matched[id] = some[id]
		}
	}
	ids, null := reference(f.Null, matched)
	return ids, null, nil
}

var identifierPattern = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9]*)-(\d+)$`)

// Issue accepts an id or an identifier such as ENG-123.
func (s *Scope) Issue(ctx context.Context, id string) (storage.Issue, error) {
	var issue storage.Issue
	err := storage.ErrNotFound
	if m := identifierPattern.FindStringSubmatch(id); m != nil {
		if number, parseErr := strconv.ParseInt(m[2], 10, 32); parseErr == nil {
			issue, err = s.svc.store.IssueByNumber(ctx, s.actor.WorkspaceID, m[1], int32(number))
		}
	} else if isUUID(id) {
		issue, err = s.svc.store.Issue(ctx, s.actor.WorkspaceID, id)
	}
	return issue, notFound(err, "Issue")
}

func (s *Scope) Identifier(ctx context.Context, issue storage.Issue) (string, error) {
	team, err := s.Team(ctx, issue.TeamID)
	if err != nil {
		return "", err
	}
	return team.Key + "-" + strconv.Itoa(int(issue.Number)), nil
}

func (s *Scope) URL(path string) string {
	return s.svc.url + path
}

func (s *Scope) Children(ctx context.Context, parentID string, args PageArgs) (Page[storage.Issue], error) {
	return s.Issues(ctx, IssueQuery{Filter: &IssueFilter{Parent: &IssueFilter{ID: &IDComparator{Eq: &parentID}}}, PageArgs: args})
}

func (s *Scope) IssueHistory(ctx context.Context, issueID string) ([]storage.IssueHistory, error) {
	return s.svc.store.IssueHistory(ctx, issueID)
}

type IssueCreateInput struct {
	ID          *string
	TeamID      string
	Title       *string
	Description *string
	StateID     *string
	Priority    *int32
	Estimate    *int32
	AssigneeID  *string
	ProjectID   *string
	CycleID     *string
	ParentID    *string
	LabelIDs    []string
	DueDate     *time.Time
	SortOrder   *float64
}

func (s *Scope) CreateIssue(ctx context.Context, in IssueCreateInput) (storage.Issue, error) {
	team, err := s.Team(ctx, in.TeamID)
	if err != nil {
		return storage.Issue{}, err
	}
	if in.ID != nil && !isUUID(*in.ID) {
		return storage.Issue{}, invalid("id must be a UUID")
	}
	issue := storage.Issue{
		TeamID:      team.ID,
		Title:       strings.TrimSpace(deref(in.Title)),
		Description: in.Description,
		Priority:    deref(in.Priority),
		Estimate:    in.Estimate,
		AssigneeID:  in.AssigneeID,
		ProjectID:   in.ProjectID,
		CycleID:     in.CycleID,
		ParentID:    in.ParentID,
		LabelIDs:    in.LabelIDs,
		DueDate:     in.DueDate,
	}
	if in.StateID != nil {
		issue.StateID = *in.StateID
	} else if issue.StateID, err = s.defaultState(ctx, team.ID); err != nil {
		return storage.Issue{}, err
	}
	if err := s.check(ctx, nil, &issue); err != nil {
		return storage.Issue{}, err
	}
	return s.svc.store.CreateIssue(ctx, storage.NewIssue{
		ID:          in.ID,
		WorkspaceID: s.actor.WorkspaceID,
		TeamID:      issue.TeamID,
		Title:       issue.Title,
		Description: issue.Description,
		StateID:     issue.StateID,
		Priority:    issue.Priority,
		Estimate:    issue.Estimate,
		AssigneeID:  issue.AssigneeID,
		CreatorID:   &s.actor.UserID,
		ProjectID:   issue.ProjectID,
		CycleID:     issue.CycleID,
		ParentID:    issue.ParentID,
		LabelIDs:    issue.LabelIDs,
		DueDate:     issue.DueDate,
		SortOrder:   in.SortOrder,
		StartedAt:   issue.StartedAt,
		CompletedAt: issue.CompletedAt,
		CanceledAt:  issue.CanceledAt,
	})
}

// defaultState picks the team's first unstarted state, falling back to backlog.
func (s *Scope) defaultState(ctx context.Context, teamID string) (string, error) {
	states, err := s.TeamStates(ctx, teamID)
	if err != nil {
		return "", err
	}
	for _, kind := range []string{"unstarted", "backlog"} {
		if i := slices.IndexFunc(states, func(st storage.WorkflowState) bool { return st.Type == kind }); i >= 0 {
			return states[i].ID, nil
		}
	}
	return "", invalid("team has no unstarted or backlog state")
}

// Optional distinguishes an omitted input field from an explicit null.
type Optional[T any] struct {
	Set   bool
	Value *T
}

func (o Optional[T]) apply(dst **T) {
	if o.Set {
		*dst = o.Value
	}
}

type IssueUpdateInput struct {
	Title           *string
	Description     Optional[string]
	StateID         *string
	Priority        Optional[int32]
	Estimate        Optional[int32]
	AssigneeID      Optional[string]
	ProjectID       Optional[string]
	CycleID         Optional[string]
	ParentID        Optional[string]
	TeamID          *string
	LabelIDs        []string
	AddedLabelIDs   []string
	RemovedLabelIDs []string
	DueDate         Optional[time.Time]
	SortOrder       *float64
}

func (s *Scope) UpdateIssue(ctx context.Context, id string, in IssueUpdateInput) (storage.Issue, error) {
	return s.mutate(ctx, id, func(next *storage.Issue) error {
		if in.Title != nil {
			next.Title = strings.TrimSpace(*in.Title)
		}
		in.Description.apply(&next.Description)
		in.Estimate.apply(&next.Estimate)
		in.AssigneeID.apply(&next.AssigneeID)
		in.ProjectID.apply(&next.ProjectID)
		in.CycleID.apply(&next.CycleID)
		in.ParentID.apply(&next.ParentID)
		in.DueDate.apply(&next.DueDate)
		if in.Priority.Set {
			next.Priority = deref(in.Priority.Value)
		}
		if in.SortOrder != nil {
			next.SortOrder = *in.SortOrder
		}
		if in.StateID != nil {
			next.StateID = *in.StateID
		}
		if in.TeamID != nil {
			if err := s.moveTeam(ctx, next, *in.TeamID, in.StateID == nil, !in.CycleID.Set); err != nil {
				return err
			}
		}
		if in.LabelIDs != nil {
			next.LabelIDs = in.LabelIDs
		}
		next.LabelIDs = append(slices.DeleteFunc(slices.Clone(next.LabelIDs), func(id string) bool {
			return slices.Contains(in.RemovedLabelIDs, id)
		}), in.AddedLabelIDs...)
		return nil
	})
}

// moveTeam re-homes an issue, keeping its state type and dropping the old
// team's cycle and team-scoped labels unless the caller chose replacements.
func (s *Scope) moveTeam(ctx context.Context, issue *storage.Issue, teamID string, mapState, dropCycle bool) error {
	team, err := s.Team(ctx, teamID)
	if err != nil || team.ID == issue.TeamID {
		return err
	}
	if mapState {
		current, err := s.WorkflowState(ctx, issue.StateID)
		if err != nil {
			return err
		}
		states, err := s.TeamStates(ctx, team.ID)
		if err != nil {
			return err
		}
		i := slices.IndexFunc(states, func(st storage.WorkflowState) bool { return st.Type == current.Type })
		if i < 0 {
			return invalid("team %s has no %s state", team.Key, current.Type)
		}
		issue.StateID = states[i].ID
	}
	if dropCycle {
		issue.CycleID = nil
	}
	labels, err := s.IssueLabels(ctx)
	if err != nil {
		return err
	}
	issue.LabelIDs = slices.DeleteFunc(slices.Clone(issue.LabelIDs), func(id string) bool {
		label, ok := findLabel(labels, &id)
		return ok && label.TeamID != nil
	})
	issue.TeamID = team.ID
	return nil
}

func (s *Scope) AddLabel(ctx context.Context, id, labelID string) (storage.Issue, error) {
	return s.UpdateIssue(ctx, id, IssueUpdateInput{AddedLabelIDs: []string{labelID}})
}

func (s *Scope) RemoveLabel(ctx context.Context, id, labelID string) (storage.Issue, error) {
	return s.UpdateIssue(ctx, id, IssueUpdateInput{RemovedLabelIDs: []string{labelID}})
}

func (s *Scope) ArchiveIssue(ctx context.Context, id string, archived bool) (storage.Issue, error) {
	return s.mutate(ctx, id, func(next *storage.Issue) error {
		if archived == (next.ArchivedAt != nil) {
			return nil
		}
		next.ArchivedAt = nil
		if archived {
			now := s.svc.now()
			next.ArchivedAt = &now
		}
		return nil
	})
}

func (s *Scope) DeleteIssue(ctx context.Context, id string) (storage.Issue, error) {
	issue, err := s.Issue(ctx, id)
	if err != nil {
		return issue, err
	}
	return issue, notFound(s.svc.store.DeleteIssue(ctx, s.actor.WorkspaceID, issue.ID), "Issue")
}

func (s *Scope) mutate(ctx context.Context, id string, edit func(*storage.Issue) error) (storage.Issue, error) {
	current, err := s.Issue(ctx, id)
	if err != nil {
		return current, err
	}
	updated, err := s.svc.store.UpdateIssue(ctx, s.actor.WorkspaceID, current.ID,
		func(prev storage.Issue) (storage.Issue, *storage.NewIssueHistory, error) {
			next := prev
			if err := edit(&next); err != nil {
				return prev, nil, err
			}
			if err := s.check(ctx, &prev, &next); err != nil {
				return prev, nil, err
			}
			return next, s.history(prev, next), nil
		})
	return updated, notFound(err, "Issue")
}

// check validates an issue's references against the workspace and stamps the
// lifecycle timestamps its state implies.
func (s *Scope) check(ctx context.Context, prev, next *storage.Issue) error {
	if next.Title == "" {
		return invalid("title is required")
	}
	if next.Priority < 0 || next.Priority > 4 {
		return invalid("priority must be between 0 and 4")
	}
	if next.Estimate != nil && *next.Estimate < 0 {
		return invalid("estimate must not be negative")
	}
	state, err := s.WorkflowState(ctx, next.StateID)
	if err != nil {
		return err
	}
	if state.TeamID != next.TeamID {
		return invalid("state %s does not belong to the issue's team", state.Name)
	}
	if prev == nil || prev.StateID != next.StateID {
		stamp(next, state.Type, s.svc.now())
	}
	if next.AssigneeID != nil {
		if _, err := s.User(ctx, *next.AssigneeID); err != nil {
			return err
		}
	}
	if next.ProjectID != nil {
		project, err := s.Project(ctx, *next.ProjectID)
		if err != nil {
			return err
		}
		next.ProjectID = &project.ID
	}
	if next.CycleID != nil {
		cycle, err := s.Cycle(ctx, *next.CycleID)
		if err != nil {
			return err
		}
		if cycle.TeamID != next.TeamID {
			return invalid("cycle does not belong to the issue's team")
		}
	}
	if next.ParentID != nil {
		if err := s.checkParent(ctx, next); err != nil {
			return err
		}
	}
	return s.checkLabels(ctx, next)
}

func (s *Scope) checkParent(ctx context.Context, issue *storage.Issue) error {
	parent, err := s.Issue(ctx, *issue.ParentID)
	if err != nil {
		return err
	}
	issue.ParentID = &parent.ID
	for ancestor := &parent; ; {
		if ancestor.ID == issue.ID {
			return invalid("an issue cannot be its own ancestor")
		}
		if ancestor.ParentID == nil {
			return nil
		}
		next, err := s.svc.store.Issue(ctx, s.actor.WorkspaceID, *ancestor.ParentID)
		if err != nil {
			return notFound(err, "Issue")
		}
		ancestor = &next
	}
}

func (s *Scope) checkLabels(ctx context.Context, issue *storage.Issue) error {
	ids := []string{}
	for _, id := range issue.LabelIDs {
		if slices.Contains(ids, id) {
			continue
		}
		label, err := s.IssueLabel(ctx, id)
		if err != nil {
			return err
		}
		if label.IsGroup {
			return invalid("label group %s cannot be applied to issues", label.Name)
		}
		if label.TeamID != nil && *label.TeamID != issue.TeamID {
			return invalid("label %s belongs to another team", label.Name)
		}
		ids = append(ids, id)
	}
	issue.LabelIDs = ids
	return nil
}

func stamp(issue *storage.Issue, stateType string, now time.Time) {
	switch stateType {
	case "started":
		if issue.StartedAt == nil {
			issue.StartedAt = &now
		}
		issue.CompletedAt, issue.CanceledAt = nil, nil
	case "completed":
		issue.CompletedAt, issue.CanceledAt = &now, nil
	case "canceled":
		issue.CompletedAt, issue.CanceledAt = nil, &now
	default:
		issue.StartedAt, issue.CompletedAt, issue.CanceledAt = nil, nil, nil
	}
}

// history records the tracked differences between two versions of an issue.
func (s *Scope) history(prev, next storage.Issue) *storage.NewIssueHistory {
	h := storage.NewIssueHistory{IssueID: prev.ID, ActorID: &s.actor.UserID}
	changed := diff(&prev.StateID, &next.StateID, &h.FromStateID, &h.ToStateID)
	changed = diff(&prev.TeamID, &next.TeamID, &h.FromTeamID, &h.ToTeamID) || changed
	changed = diff(&prev.Title, &next.Title, &h.FromTitle, &h.ToTitle) || changed
	changed = diff(&prev.Priority, &next.Priority, &h.FromPriority, &h.ToPriority) || changed
	changed = diff(prev.Estimate, next.Estimate, &h.FromEstimate, &h.ToEstimate) || changed
	changed = diff(prev.AssigneeID, next.AssigneeID, &h.FromAssigneeID, &h.ToAssigneeID) || changed
	changed = diff(prev.ProjectID, next.ProjectID, &h.FromProjectID, &h.ToProjectID) || changed
	changed = diff(prev.CycleID, next.CycleID, &h.FromCycleID, &h.ToCycleID) || changed
	changed = diff(prev.ParentID, next.ParentID, &h.FromParentID, &h.ToParentID) || changed
	changed = diff(prev.DueDate, next.DueDate, &h.FromDueDate, &h.ToDueDate) || changed
	h.AddedLabelIDs = without(next.LabelIDs, prev.LabelIDs)
	h.RemovedLabelIDs = without(prev.LabelIDs, next.LabelIDs)
	h.UpdatedDescription = deref(prev.Description) != deref(next.Description)
	if (prev.ArchivedAt == nil) != (next.ArchivedAt == nil) {
		archived := next.ArchivedAt != nil
		h.Archived = &archived
	}
	if !changed && len(h.AddedLabelIDs) == 0 && len(h.RemovedLabelIDs) == 0 && !h.UpdatedDescription && h.Archived == nil {
		return nil
	}
	return &h
}

func diff[T comparable](from, to *T, dstFrom, dstTo **T) bool {
	if from == nil && to == nil || from != nil && to != nil && *from == *to {
		return false
	}
	*dstFrom, *dstTo = from, to
	return true
}

func without(items, remove []string) []string {
	return slices.DeleteFunc(slices.Clone(items), func(id string) bool { return slices.Contains(remove, id) })
}
