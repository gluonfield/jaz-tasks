package gql_test

import (
	"fmt"
	"strings"
	"testing"
)

func TestGraphQLOperationLimits(t *testing.T) {
	c := newClient(t)
	var aliases strings.Builder
	aliases.WriteString("{")
	for i := range 256 {
		fmt.Fprintf(&aliases, "batch%d: issues(first: 250) { nodes { id title } } ", i)
	}
	aliases.WriteString("}")
	fragments := "query { viewer { ...F0 } } "
	for i := range 20 {
		fragments += fmt.Sprintf("fragment F%d on User { ...F%d ...F%d } ", i, i+1, i+1)
	}
	fragments += "fragment F20 on User { id }"
	queries := map[string]string{
		"aliases":      aliases.String(),
		"nested pages": `{ issues(first: 250) { nodes { children(first: 250) { nodes { id } } } } }`,
		"fragments":    fragments,
		"depth":        `{ issues(first: 1) { nodes { ` + strings.Repeat("children(first: 1) { nodes { ", 12) + "id" + strings.Repeat(" } }", 12) + " } } }",
		"payload":      `{ viewer { id } }` + strings.Repeat(" ", 1<<20),
	}
	for name, query := range queries {
		t.Run(name, func(t *testing.T) {
			_, out := c.do(query, c.key)
			if len(out.Errors) == 0 || len(out.Data) != 0 {
				t.Fatalf("unbounded query executed: %+v", out)
			}
		})
	}
	_, normal := c.do(`{ issues(first: 250) { nodes { id title team { id } labels { nodes { id name } } } } }`, c.key)
	if len(normal.Errors) > 0 || normal.Data["issues"] == nil {
		t.Fatalf("ordinary paginated query failed: %+v", normal)
	}
}
