package gql_test

import (
	"context"
	"strings"
	"testing"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
)

// memberKey is an API key for jonas, a seeded member who is not an admin.
func memberKey(t *testing.T, c *client) string {
	t.Helper()
	_, out := c.do(`{ users(filter: { displayName: { eq: "jonas" } }) { nodes { id admin } } }`, c.key)
	id, _ := get(out.Data, "users.nodes.0.id").(string)
	if id == "" || get(out.Data, "users.nodes.0.admin") != false {
		t.Fatalf("jonas: %+v %+v", out.Data, out.Errors)
	}
	key, _, err := auth.NewService(c.store, auth.Config{PublicURL: "http://tasks.test"}).CreateKey(context.Background(), id, "jonas", "")
	if err != nil {
		t.Fatal(err)
	}
	return key
}

// rejected runs documents that must fail as user errors.
func rejected(t *testing.T, c *client, docs map[string]string) {
	t.Helper()
	for doc, key := range docs {
		if _, out := c.do(doc, key); len(out.Errors) == 0 || out.Errors[0].Extensions["code"] != "INPUT_ERROR" {
			t.Errorf("%s: %+v %+v", doc, out.Data, out.Errors)
		}
	}
}

func TestRenameWorkspaceAndTeam(t *testing.T) {
	c := newClient(t)
	member := memberKey(t, c)
	_, out := c.do(`mutation {
		organizationUpdate(input: { name: "  Acme  " }) { success organization { name } }
		teamUpdate(id: "ENG", input: { name: "Platform" }) { success team { name key } }
	}`, c.key)
	if len(out.Errors) > 0 || get(out.Data, "organizationUpdate.organization.name") != "Acme" ||
		get(out.Data, "teamUpdate.team.name") != "Platform" || get(out.Data, "teamUpdate.team.key") != "ENG" {
		t.Fatalf("rename: %+v %+v", out.Data, out.Errors)
	}
	if _, out = c.do(`mutation { teamUpdate(id: "ENG", input: { name: "Core" }) { success } }`, member); get(out.Data, "teamUpdate.success") != true {
		t.Fatalf("members rename teams: %+v", out.Errors)
	}

	rejected(t, c, map[string]string{
		`mutation { organizationUpdate(input: { name: "Jonas Inc" }) { success } }`:                          member,
		`mutation { organizationUpdate(input: { name: "  " }) { success } }`:                                 c.key,
		`mutation { teamUpdate(id: "ENG", input: { name: "" }) { success } }`:                                c.key,
		`mutation { teamUpdate(id: "ENG", input: { name: "` + strings.Repeat("x", 81) + `" }) { success } }`: c.key,
	})
	if _, out := c.do(`mutation { teamUpdate(id: "ENG", input: { key: "NEW" }) { success } }`, c.key); len(out.Errors) == 0 {
		t.Error("teamUpdate accepted a key")
	}

	_, out = c.do(`{ organization { name } issue(id: "ENG-1") { identifier team { name key } } }`, member)
	if get(out.Data, "organization.name") != "Acme" || get(out.Data, "issue.identifier") != "ENG-1" ||
		get(out.Data, "issue.team.name") != "Core" || get(out.Data, "issue.team.key") != "ENG" {
		t.Fatalf("after renames: %+v %+v", out.Data, out.Errors)
	}
}

func TestOrganizationInvites(t *testing.T) {
	c := newClient(t)
	member := memberKey(t, c)
	_, out := c.do(`mutation { organizationInviteCreate(input: { email: " Pat@Example.com " }) { success organizationInvite { id email } } }`, c.key)
	id, _ := get(out.Data, "organizationInviteCreate.organizationInvite.id").(string)
	if id == "" || get(out.Data, "organizationInviteCreate.organizationInvite.email") != "pat@example.com" {
		t.Fatalf("invite: %+v %+v", out.Data, out.Errors)
	}
	remove := `mutation { organizationInviteDelete(id: "` + id + `") { success entityId } }`

	rejected(t, c, map[string]string{
		`mutation { organizationInviteCreate(input: { email: "pat@example.com" }) { success } }`: c.key,
		`mutation { organizationInviteCreate(input: { email: "not-an-email" }) { success } }`:    c.key,
		`mutation { organizationInviteCreate(input: { email: " " }) { success } }`:               c.key,
		`mutation { organizationInviteCreate(input: { email: "sam@example.com" }) { success } }`: member,
		remove: member,
	})

	_, out = c.do(`{ organizationInvites { nodes { id email } } }`, member)
	if get(out.Data, "organizationInvites.nodes.#") != 1.0 || get(out.Data, "organizationInvites.nodes.0.id") != id {
		t.Fatalf("members see pending invites: %+v %+v", out.Data, out.Errors)
	}
	if _, out = c.do(remove, c.key); get(out.Data, "organizationInviteDelete.entityId") != id {
		t.Fatalf("delete: %+v %+v", out.Data, out.Errors)
	}
	if _, out = c.do(`{ organizationInvites { nodes { id } } }`, c.key); get(out.Data, "organizationInvites.nodes.#") != 0.0 {
		t.Fatalf("after delete: %+v", out.Data)
	}
	rejected(t, c, map[string]string{remove: c.key})
}
