package tracker

import (
	"slices"
	"strings"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

// Filters mirror the Linear filter inputs the API supports. Every catalog
// filter is evaluated in memory; issue filters resolve to id sets first.

type StringComparator struct {
	Eq                    *string
	Neq                   *string
	In                    []string
	Nin                   []string
	EqIgnoreCase          *string
	NeqIgnoreCase         *string
	Contains              *string
	ContainsIgnoreCase    *string
	NotContains           *string
	NotContainsIgnoreCase *string
	StartsWith            *string
	EndsWith              *string
}

func (c *StringComparator) match(v string) bool {
	if c == nil {
		return true
	}
	lower := strings.ToLower(v)
	return test(c.Eq, func(x string) bool { return v == x }) &&
		test(c.Neq, func(x string) bool { return v != x }) &&
		(c.In == nil || slices.Contains(c.In, v)) &&
		(c.Nin == nil || !slices.Contains(c.Nin, v)) &&
		test(c.EqIgnoreCase, func(x string) bool { return strings.EqualFold(v, x) }) &&
		test(c.NeqIgnoreCase, func(x string) bool { return !strings.EqualFold(v, x) }) &&
		test(c.Contains, func(x string) bool { return strings.Contains(v, x) }) &&
		test(c.ContainsIgnoreCase, func(x string) bool { return strings.Contains(lower, strings.ToLower(x)) }) &&
		test(c.NotContains, func(x string) bool { return !strings.Contains(v, x) }) &&
		test(c.NotContainsIgnoreCase, func(x string) bool { return !strings.Contains(lower, strings.ToLower(x)) }) &&
		test(c.StartsWith, func(x string) bool { return strings.HasPrefix(v, x) }) &&
		test(c.EndsWith, func(x string) bool { return strings.HasSuffix(v, x) })
}

type IDComparator struct {
	Eq  *string
	Neq *string
	In  []string
	Nin []string
}

func (c *IDComparator) match(v string) bool {
	if c == nil {
		return true
	}
	return test(c.Eq, func(x string) bool { return v == x }) &&
		test(c.Neq, func(x string) bool { return v != x }) &&
		(c.In == nil || slices.Contains(c.In, v)) &&
		(c.Nin == nil || !slices.Contains(c.Nin, v))
}

// exact returns the ids an eq/in comparator names; issue ids cannot be
// enumerated in memory, so negative comparators are rejected there.
func (c *IDComparator) exact() ([]string, error) {
	if c.Neq != nil || c.Nin != nil {
		return nil, invalid("issue id filters support eq and in")
	}
	ids := slices.Clone(c.In)
	if c.Eq != nil {
		if ids != nil && !slices.Contains(ids, *c.Eq) {
			return []string{}, nil
		}
		ids = []string{*c.Eq}
	}
	return ids, nil
}

type NumberComparator struct {
	Eq   *float64
	Neq  *float64
	In   []float64
	Nin  []float64
	Lt   *float64
	Lte  *float64
	Gt   *float64
	Gte  *float64
	Null *bool
}

func (c *NumberComparator) match(v float64) bool {
	if c == nil {
		return true
	}
	return test(c.Eq, func(x float64) bool { return v == x }) &&
		test(c.Neq, func(x float64) bool { return v != x }) &&
		(c.In == nil || slices.Contains(c.In, v)) &&
		(c.Nin == nil || !slices.Contains(c.Nin, v)) &&
		test(c.Lt, func(x float64) bool { return v < x }) &&
		test(c.Lte, func(x float64) bool { return v <= x }) &&
		test(c.Gt, func(x float64) bool { return v > x }) &&
		test(c.Gte, func(x float64) bool { return v >= x }) &&
		test(c.Null, func(null bool) bool { return !null })
}

type BooleanComparator struct {
	Eq  *bool
	Neq *bool
}

func (c *BooleanComparator) match(v bool) bool {
	if c == nil {
		return true
	}
	return test(c.Eq, func(x bool) bool { return v == x }) && test(c.Neq, func(x bool) bool { return v != x })
}

type ContentComparator struct {
	Contains *string
}

func test[T any](want *T, pass func(T) bool) bool {
	return want == nil || pass(*want)
}

type TeamFilter struct {
	ID   *IDComparator
	Key  *StringComparator
	Name *StringComparator
}

func (f *TeamFilter) match(t storage.Team) bool {
	return f == nil || f.ID.match(t.ID) && f.Key.match(t.Key) && f.Name.match(t.Name)
}

// UserFilter also serves NullableUserFilter; Null only exists on the latter.
type UserFilter struct {
	ID          *IDComparator
	Name        *StringComparator
	DisplayName *StringComparator
	Email       *StringComparator
	Active      *BooleanComparator
	Admin       *BooleanComparator
	IsMe        *BooleanComparator
	Null        *bool
}

func (f *UserFilter) match(u storage.User, viewerID string) bool {
	return f == nil || f.ID.match(u.ID) && f.Name.match(u.Name) && f.DisplayName.match(u.DisplayName) &&
		f.Email.match(u.Email) && f.Active.match(u.Active) && f.Admin.match(u.Admin) && f.IsMe.match(u.ID == viewerID)
}

type WorkflowStateFilter struct {
	ID       *IDComparator
	Name     *StringComparator
	Type     *StringComparator
	Position *NumberComparator
	Team     *TeamFilter
}

// IssueLabelFilter also serves IssueLabelCollectionFilter, where Some, Null and
// the direct comparators mean "any of the issue's labels matches".
type IssueLabelFilter struct {
	ID      *IDComparator
	Name    *StringComparator
	IsGroup *BooleanComparator
	Team    *TeamFilter
	Parent  *IssueLabelFilter
	Some    *IssueLabelFilter
	Null    *bool
}

type ProjectStatusFilter struct {
	ID   *IDComparator
	Name *StringComparator
	Type *StringComparator
}

// ProjectFilter also serves NullableProjectFilter.
type ProjectFilter struct {
	ID     *IDComparator
	Name   *StringComparator
	SlugID *StringComparator
	Status *ProjectStatusFilter
	Lead   *UserFilter
	Null   *bool
}

// CycleFilter also serves NullableCycleFilter.
type CycleFilter struct {
	ID       *IDComparator
	Name     *StringComparator
	Number   *NumberComparator
	Team     *TeamFilter
	IsActive *BooleanComparator
	IsFuture *BooleanComparator
	IsPast   *BooleanComparator
	Null     *bool
}

// IssueFilter also serves NullableIssueFilter (as a parent filter).
type IssueFilter struct {
	ID                *IDComparator
	Priority          *NumberComparator
	Team              *TeamFilter
	State             *WorkflowStateFilter
	Assignee          *UserFilter
	Creator           *UserFilter
	Project           *ProjectFilter
	Cycle             *CycleFilter
	Parent            *IssueFilter
	Labels            *IssueLabelFilter
	SearchableContent *ContentComparator
	Null              *bool
}

type CommentFilter struct {
	ID    *IDComparator
	Body  *StringComparator
	User  *UserFilter
	Issue *IssueFilter
}

func (s *Scope) teamIDs(teams []storage.Team, f *TeamFilter) map[string]bool {
	return idSet(teams, func(t storage.Team) (string, bool) { return t.ID, f.match(t) })
}

func idSet[T any](items []T, keep func(T) (string, bool)) map[string]bool {
	set := map[string]bool{}
	for _, item := range items {
		if id, ok := keep(item); ok {
			set[id] = true
		}
	}
	return set
}

func keys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	return out
}

func (s *Scope) matchState(f *WorkflowStateFilter, st storage.WorkflowState, teams map[string]bool) bool {
	return f == nil || f.ID.match(st.ID) && f.Name.match(st.Name) && f.Type.match(st.Type) &&
		f.Position.match(st.Position) && (f.Team == nil || teams[st.TeamID])
}

func (s *Scope) matchLabel(f *IssueLabelFilter, l storage.IssueLabel, labels []storage.IssueLabel, teams map[string]bool) bool {
	if f == nil {
		return true
	}
	if f.Team != nil && (l.TeamID == nil || !teams[*l.TeamID]) {
		return false
	}
	if f.Parent != nil {
		parent, ok := findLabel(labels, l.ParentID)
		if !ok || !s.matchLabel(f.Parent, parent, labels, teams) {
			return false
		}
	}
	return f.ID.match(l.ID) && f.Name.match(l.Name) && f.IsGroup.match(l.IsGroup)
}

func findLabel(labels []storage.IssueLabel, id *string) (storage.IssueLabel, bool) {
	if id == nil {
		return storage.IssueLabel{}, false
	}
	i := slices.IndexFunc(labels, func(l storage.IssueLabel) bool { return l.ID == *id })
	if i < 0 {
		return storage.IssueLabel{}, false
	}
	return labels[i], true
}

func (s *Scope) matchProject(f *ProjectFilter, p storage.Project, users []storage.User) bool {
	if f == nil {
		return true
	}
	if f.Lead != nil {
		lead, err := find(users, nil, "User", func(u storage.User) bool { return p.LeadID != nil && u.ID == *p.LeadID })
		if !nullableMatch(f.Lead.Null, err == nil, func() bool { return f.Lead.match(lead, s.actor.UserID) }) {
			return false
		}
	}
	status := projectStatus(p.Status)
	return f.ID.match(p.ID) && f.Name.match(p.Name) && f.SlugID.match(p.SlugID) &&
		(f.Status == nil || f.Status.ID.match(status.ID) && f.Status.Name.match(status.Name) && f.Status.Type.match(status.Type))
}

func (s *Scope) matchCycle(f *CycleFilter, c storage.Cycle, teams map[string]bool, now time.Time) bool {
	return f == nil || f.ID.match(c.ID) && f.Name.match(deref(c.Name)) && f.Number.match(float64(c.Number)) &&
		(f.Team == nil || teams[c.TeamID]) && f.IsActive.match(CycleActive(c, now)) &&
		f.IsFuture.match(c.StartsAt.After(now)) && f.IsPast.match(!c.EndsAt.After(now))
}

// nullableMatch applies a Nullable*Filter to a reference that may be unset:
// null: true matches only unset references, anything else needs a match.
func nullableMatch(null *bool, present bool, match func() bool) bool {
	if null != nil && *null {
		return !present
	}
	return present && match()
}

// reference resolves a Nullable*Filter over an issue foreign key to the ids
// it admits and whether an unset key passes.
func reference(null *bool, matched map[string]bool) ([]string, bool) {
	if null != nil && *null {
		return []string{}, true
	}
	return keys(matched), false
}

func deref[T any](v *T) T {
	var zero T
	if v == nil {
		return zero
	}
	return *v
}

// and narrows an id comparator to also require id.
func (c *IDComparator) and(id string) *IDComparator {
	out := IDComparator{}
	if c != nil {
		out = *c
		if c.Eq != nil && *c.Eq != id {
			out.In = []string{}
		}
	}
	out.Eq = &id
	return &out
}

// The With* helpers AND a nested connection's owner onto a caller's filter,
// which may be nil.

func (f *IssueFilter) WithTeam(id string) *IssueFilter {
	g := deref(f)
	team := deref(g.Team)
	team.ID = team.ID.and(id)
	g.Team = &team
	return &g
}

func (f *IssueFilter) WithAssignee(id string) *IssueFilter {
	g := deref(f)
	g.Assignee = narrowUser(g.Assignee, id)
	return &g
}

func (f *IssueFilter) WithCreator(id string) *IssueFilter {
	g := deref(f)
	g.Creator = narrowUser(g.Creator, id)
	return &g
}

func narrowUser(f *UserFilter, id string) *UserFilter {
	user := deref(f)
	user.ID = user.ID.and(id)
	return &user
}

func (f *IssueFilter) WithProject(id string) *IssueFilter {
	g := deref(f)
	project := deref(g.Project)
	project.ID = project.ID.and(id)
	g.Project = &project
	return &g
}

func (f *IssueFilter) WithCycle(id string) *IssueFilter {
	g := deref(f)
	cycle := deref(g.Cycle)
	cycle.ID = cycle.ID.and(id)
	g.Cycle = &cycle
	return &g
}

func (f *IssueFilter) WithParent(id string) *IssueFilter {
	g := deref(f)
	parent := deref(g.Parent)
	parent.ID = parent.ID.and(id)
	g.Parent = &parent
	return &g
}
