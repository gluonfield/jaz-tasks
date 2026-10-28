package mcpapi_test

import (
	"fmt"
	"strings"
	"testing"
)

func TestGraphQLBridgeEnforcesOperationLimits(t *testing.T) {
	e := serve(t)
	s := e.session(t, e.key)
	var aliases strings.Builder
	aliases.WriteString("{")
	for i := range 256 {
		fmt.Fprintf(&aliases, "batch%d: issues(first: 250) { nodes { id title } } ", i)
	}
	aliases.WriteString("}")
	type result struct {
		Data   map[string]any `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	for _, query := range []string{
		aliases.String(),
		`{ issues(first: 250) { nodes { children(first: 250) { nodes { id } } } } }`,
		`{ viewer { id } }` + strings.Repeat(" ", 1<<20),
	} {
		out := call[result](t, s, "graphql", map[string]any{"query": query})
		if len(out.Errors) == 0 || len(out.Data) > 0 {
			t.Fatalf("embedded GraphQL bypassed query limits: %+v", out)
		}
	}
}
