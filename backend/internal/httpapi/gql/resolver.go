package gql

import (
	"context"
	"strings"

	"github.com/99designs/gqlgen/graphql"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

// Resolver is stateless: every resolver works through the request's tracker
// scope, which carries the actor and memoizes the workspace catalog.
type Resolver struct{}

type (
	queryResolver             struct{}
	mutationResolver          struct{}
	organizationResolver      struct{}
	userResolver              struct{}
	teamResolver              struct{}
	workflowStateResolver     struct{}
	issueLabelResolver        struct{}
	projectResolver           struct{}
	cycleResolver             struct{}
	issueResolver             struct{}
	issueSearchResultResolver struct{ issueResolver }
	commentResolver           struct{}
	issueHistoryResolver      struct{}
)

func (Resolver) Query() QueryResolver                         { return queryResolver{} }
func (Resolver) Mutation() MutationResolver                   { return mutationResolver{} }
func (Resolver) Organization() OrganizationResolver           { return organizationResolver{} }
func (Resolver) User() UserResolver                           { return userResolver{} }
func (Resolver) Team() TeamResolver                           { return teamResolver{} }
func (Resolver) WorkflowState() WorkflowStateResolver         { return workflowStateResolver{} }
func (Resolver) IssueLabel() IssueLabelResolver               { return issueLabelResolver{} }
func (Resolver) Project() ProjectResolver                     { return projectResolver{} }
func (Resolver) Cycle() CycleResolver                         { return cycleResolver{} }
func (Resolver) Issue() IssueResolver                         { return issueResolver{} }
func (Resolver) IssueSearchResult() IssueSearchResultResolver { return issueSearchResultResolver{} }
func (Resolver) Comment() CommentResolver                     { return commentResolver{} }
func (Resolver) IssueHistory() IssueHistoryResolver           { return issueHistoryResolver{} }

type scopeKey struct{}

func withScope(ctx context.Context, s *tracker.Scope) context.Context {
	return context.WithValue(ctx, scopeKey{}, s)
}

func scope(ctx context.Context) *tracker.Scope {
	return ctx.Value(scopeKey{}).(*tracker.Scope)
}

func ref[T any](v T, err error) (*T, error) {
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// lookup resolves an optional reference; an unset id is null.
func lookup[T any](ctx context.Context, id *string, load func(context.Context, string) (T, error)) (*T, error) {
	if id == nil {
		return nil, nil
	}
	return ref(load(ctx, *id))
}

func paged[T any](items []T, err error, after *string, first *int32) (*tracker.Page[T], error) {
	if err != nil {
		return nil, err
	}
	return ref(tracker.Paginate(items, tracker.PageArgs{First: first, After: after}))
}

func issues(ctx context.Context, filter *tracker.IssueFilter, after *string, first *int32, includeArchived *bool, orderBy *PaginationOrderBy) (*IssueConnection, error) {
	return ref(scope(ctx).Issues(ctx, tracker.IssueQuery{
		Filter:          filter,
		IncludeArchived: includeArchived != nil && *includeArchived,
		OrderByUpdated:  orderBy != nil && *orderBy == PaginationOrderByUpdatedAt,
		PageArgs:        tracker.PageArgs{First: first, After: after},
	}))
}

func users(ctx context.Context, filter *tracker.UserFilter, includeDisabled *bool, keep func(storage.User) bool, after *string, first *int32) (*UserConnection, error) {
	found, err := scope(ctx).FindUsers(ctx, filter)
	return paged(keepAll(found, func(u storage.User) bool {
		return (u.Active || includeDisabled != nil && *includeDisabled) && keep(u)
	}), err, after, first)
}

func keepAll[T any](items []T, keep func(T) bool) []T {
	out := []T{}
	for _, item := range items {
		if keep(item) {
			out = append(out, item)
		}
	}
	return out
}

func all[T any](T) bool { return true }

func flag(v *bool) bool { return v != nil && *v }

func omittable[T any](o graphql.Omittable[*T]) tracker.Optional[T] {
	v, set := o.ValueOK()
	return tracker.Optional[T]{Set: set, Value: v}
}

func initials(name string) string {
	var out strings.Builder
	for _, word := range strings.Fields(name) {
		out.WriteString(strings.ToUpper(string([]rune(word)[0])))
		if out.Len() >= 2 {
			break
		}
	}
	return out.String()
}
