package gql

import (
	"context"

	"github.com/99designs/gqlgen/graphql"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

const maxOperationBytes = 1 << 20

type operationLimit struct{}

func (operationLimit) ExtensionName() string                   { return "OperationLimit" }
func (operationLimit) Validate(graphql.ExecutableSchema) error { return nil }

func (operationLimit) MutateOperationContext(_ context.Context, op *graphql.OperationContext) *gqlerror.Error {
	budget, fields := 50_000, 512
	if !withinBudget(op.Operation.SelectionSet, op.Variables, 1, 0, &budget, &fields) {
		return &gqlerror.Error{Message: "operation exceeds the query budget; request fewer fields or smaller pages", Extensions: map[string]any{"code": "COMPLEXITY_LIMIT_EXCEEDED"}}
	}
	return nil
}

func withinBudget(set ast.SelectionSet, variables map[string]any, copies, depth int, budget, fields *int) bool {
	if depth > 20 {
		return false
	}
	for _, selection := range set {
		*fields--
		if *fields < 0 || copies > *budget {
			return false
		}
		*budget -= copies
		switch field := selection.(type) {
		case *ast.Field:
			count := 1
			if field.Definition.Arguments.ForName("first") != nil {
				count = tracker.DefaultPageSize
				if first := field.ArgumentMap(variables)["first"]; first != nil {
					value, err := graphql.UnmarshalInt32(first)
					if err != nil || value < 0 || value > tracker.MaxPageSize {
						return false
					}
					count = max(1, int(value))
				}
			}
			if len(field.SelectionSet) > 0 && (count > *budget/copies || !withinBudget(field.SelectionSet, variables, copies*count, depth+1, budget, fields)) {
				return false
			}
		case *ast.FragmentSpread:
			if !withinBudget(field.Definition.SelectionSet, variables, copies, depth+1, budget, fields) {
				return false
			}
		case *ast.InlineFragment:
			if !withinBudget(field.SelectionSet, variables, copies, depth+1, budget, fields) {
				return false
			}
		}
	}
	return true
}
