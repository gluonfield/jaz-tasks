package tracker

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

// PublicURL is the base URL the web app is reachable at; entity urls hang off it.
type PublicURL string

type Service struct {
	store storage.TrackerStore
	url   string
	now   func() time.Time
}

func NewService(store storage.TrackerStore, url PublicURL) *Service {
	return &Service{store: store, url: strings.TrimRight(string(url), "/"), now: time.Now}
}

// Scope is one actor's view of its workspace. It memoizes the small catalog
// entities (users, teams, states, labels, projects, cycles) for its lifetime,
// so create one per request.
type Scope struct {
	svc      *Service
	actor    auth.Actor
	users    memo[[]storage.User]
	teams    memo[[]storage.Team]
	states   memo[[]storage.WorkflowState]
	labels   memo[[]storage.IssueLabel]
	projects memo[[]storage.Project]
	cycles   memo[[]storage.Cycle]
	counts   memo[[]storage.IssueCount]
}

func (s *Service) Scope(actor auth.Actor) *Scope {
	return &Scope{svc: s, actor: actor}
}

func (s *Scope) Actor() auth.Actor {
	return s.actor
}

type memo[T any] struct {
	mu     sync.Mutex
	loaded bool
	value  T
}

func (m *memo[T]) get(load func() (T, error)) (T, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.loaded {
		return m.value, nil
	}
	value, err := load()
	if err != nil {
		return value, err
	}
	m.value, m.loaded = value, true
	return value, nil
}

func (m *memo[T]) reset() {
	m.mu.Lock()
	m.loaded = false
	m.mu.Unlock()
}

func (s *Scope) Users(ctx context.Context) ([]storage.User, error) {
	return s.users.get(func() ([]storage.User, error) { return s.svc.store.Users(ctx, s.actor.WorkspaceID) })
}

func (s *Scope) Teams(ctx context.Context) ([]storage.Team, error) {
	return s.teams.get(func() ([]storage.Team, error) { return s.svc.store.Teams(ctx, s.actor.WorkspaceID) })
}

func (s *Scope) WorkflowStates(ctx context.Context) ([]storage.WorkflowState, error) {
	return s.states.get(func() ([]storage.WorkflowState, error) {
		return s.svc.store.WorkflowStates(ctx, s.actor.WorkspaceID)
	})
}

func (s *Scope) IssueLabels(ctx context.Context) ([]storage.IssueLabel, error) {
	return s.labels.get(func() ([]storage.IssueLabel, error) { return s.svc.store.IssueLabels(ctx, s.actor.WorkspaceID) })
}

func (s *Scope) Projects(ctx context.Context) ([]storage.Project, error) {
	return s.projects.get(func() ([]storage.Project, error) { return s.svc.store.Projects(ctx, s.actor.WorkspaceID) })
}

func (s *Scope) Cycles(ctx context.Context) ([]storage.Cycle, error) {
	return s.cycles.get(func() ([]storage.Cycle, error) { return s.svc.store.Cycles(ctx, s.actor.WorkspaceID) })
}

func (s *Scope) Workspace(ctx context.Context) (storage.Workspace, error) {
	workspace, err := s.svc.store.Workspace(ctx, s.actor.WorkspaceID)
	return workspace, notFound(err, "Organization")
}

func (s *Scope) Viewer(ctx context.Context) (storage.User, error) {
	return s.User(ctx, s.actor.UserID)
}

func (s *Scope) User(ctx context.Context, id string) (storage.User, error) {
	users, err := s.Users(ctx)
	return find(users, err, "User", func(u storage.User) bool { return u.ID == id })
}

// Team accepts an id or a team key.
func (s *Scope) Team(ctx context.Context, id string) (storage.Team, error) {
	teams, err := s.Teams(ctx)
	return find(teams, err, "Team", func(t storage.Team) bool { return t.ID == id || strings.EqualFold(t.Key, id) })
}

func (s *Scope) WorkflowState(ctx context.Context, id string) (storage.WorkflowState, error) {
	states, err := s.WorkflowStates(ctx)
	return find(states, err, "WorkflowState", func(st storage.WorkflowState) bool { return st.ID == id })
}

func (s *Scope) IssueLabel(ctx context.Context, id string) (storage.IssueLabel, error) {
	labels, err := s.IssueLabels(ctx)
	return find(labels, err, "IssueLabel", func(l storage.IssueLabel) bool { return l.ID == id })
}

// Project accepts an id or a slug id.
func (s *Scope) Project(ctx context.Context, id string) (storage.Project, error) {
	projects, err := s.Projects(ctx)
	return find(projects, err, "Project", func(p storage.Project) bool { return p.ID == id || p.SlugID == id })
}

func (s *Scope) Cycle(ctx context.Context, id string) (storage.Cycle, error) {
	cycles, err := s.Cycles(ctx)
	return find(cycles, err, "Cycle", func(c storage.Cycle) bool { return c.ID == id })
}

// TeamStates returns a team's workflow states in position order.
func (s *Scope) TeamStates(ctx context.Context, teamID string) ([]storage.WorkflowState, error) {
	states, err := s.WorkflowStates(ctx)
	return filter(states, func(st storage.WorkflowState) bool { return st.TeamID == teamID }), err
}

func find[T any](items []T, err error, entity string, match func(T) bool) (T, error) {
	var zero T
	if err != nil {
		return zero, err
	}
	for _, item := range items {
		if match(item) {
			return item, nil
		}
	}
	return zero, NotFoundError{Entity: entity}
}

func filter[T any](items []T, keep func(T) bool) []T {
	out := []T{}
	for _, item := range items {
		if keep(item) {
			out = append(out, item)
		}
	}
	return out
}

// NotFoundError uses Linear's wording so API clients see familiar messages.
type NotFoundError struct {
	Entity string
}

func (e NotFoundError) Error() string {
	return "Entity not found: " + e.Entity
}

type InvalidInputError struct {
	Message string
}

func (e InvalidInputError) Error() string {
	return e.Message
}

func invalid(format string, args ...any) error {
	return InvalidInputError{Message: fmt.Sprintf(format, args...)}
}

func conflict(err error, message string) error {
	if errors.Is(err, storage.ErrConflict) {
		return InvalidInputError{Message: message}
	}
	return err
}

func notFound(err error, entity string) error {
	if errors.Is(err, storage.ErrNotFound) {
		return NotFoundError{Entity: entity}
	}
	return err
}

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func isUUID(id string) bool {
	return uuidPattern.MatchString(id)
}

// Page is one slice of a Linear-style cursor connection. Cursors are offsets.
type Page[T any] struct {
	Nodes    []T
	PageInfo PageInfo
}

type PageInfo struct {
	HasNextPage     bool
	HasPreviousPage bool
	StartCursor     *string
	EndCursor       *string
}

type PageArgs struct {
	First *int32
	After *string
}

const (
	defaultPageSize = 50
	maxPageSize     = 250
)

func (a PageArgs) bounds() (offset, limit int, err error) {
	limit = defaultPageSize
	if a.First != nil {
		limit = int(*a.First)
	}
	if limit < 0 || limit > maxPageSize {
		return 0, 0, invalid("first must be between 0 and %d", maxPageSize)
	}
	if a.After != nil && *a.After != "" {
		if offset, err = strconv.Atoi(*a.After); err != nil || offset < 0 {
			return 0, 0, invalid("invalid cursor %q", *a.After)
		}
	}
	return offset, limit, nil
}

// page trims one look-ahead row off nodes and describes the slice.
func page[T any](nodes []T, offset, limit int) Page[T] {
	info := PageInfo{HasPreviousPage: offset > 0}
	if len(nodes) > limit {
		nodes = nodes[:limit]
		info.HasNextPage = true
	}
	if len(nodes) > 0 {
		start, end := strconv.Itoa(offset+1), strconv.Itoa(offset+len(nodes))
		info.StartCursor, info.EndCursor = &start, &end
	}
	return Page[T]{Nodes: nodes, PageInfo: info}
}

// Paginate pages an in-memory list.
func Paginate[T any](items []T, args PageArgs) (Page[T], error) {
	offset, limit, err := args.bounds()
	if err != nil {
		return Page[T]{}, err
	}
	if offset > len(items) {
		offset = len(items)
	}
	return page(items[offset:min(len(items), offset+limit+1)], offset, limit), nil
}
