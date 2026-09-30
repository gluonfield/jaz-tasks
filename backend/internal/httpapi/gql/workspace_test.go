package gql_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/url"
	"strings"
	"testing"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/workspaces"
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

// signUp signs a new person in, giving them a workspace of their own.
func signUp(t *testing.T, c *client, name string) storage.User {
	t.Helper()
	user, err := workspaces.NewService(c.store, workspaces.Config{}).SignIn(context.Background(), auth.Identity{
		Issuer: "test", Subject: name, Email: name + "@example.com", EmailVerified: true, Name: name,
	})
	if err != nil {
		t.Fatal(err)
	}
	return user
}

// connect runs the OAuth flow an MCP host such as Jaz completes, returning
// the Authorization header its connection sends.
func connect(t *testing.T, c *client, user storage.User) string {
	t.Helper()
	ctx := context.Background()
	keys := auth.NewService(c.store, auth.Config{PublicURL: "http://tasks.test"})
	app, err := keys.RegisterClient(ctx, "Jaz", []string{"http://localhost/cb"})
	if err != nil {
		t.Fatal(err)
	}
	verifier := strings.Repeat("verifier", 8)
	sum := sha256.Sum256([]byte(verifier))
	target, err := keys.Approve(ctx, auth.Actor{UserID: user.ID, WorkspaceID: user.WorkspaceID}, auth.AuthorizeRequest{
		ResponseType: "code", ClientID: app.ID, RedirectURI: "http://localhost/cb",
		CodeChallenge: base64.RawURLEncoding.EncodeToString(sum[:]), CodeChallengeMethod: "S256",
	})
	if err != nil {
		t.Fatal(err)
	}
	redirect, _ := url.Parse(target)
	tokens, err := keys.Token(ctx, auth.TokenRequest{
		GrantType: "authorization_code", ClientID: app.ID, Code: redirect.Query().Get("code"),
		RedirectURI: "http://localhost/cb", CodeVerifier: verifier,
	})
	if err != nil {
		t.Fatal(err)
	}
	return "Bearer " + tokens.AccessToken
}

// A person invited into another workspace sees it through their existing
// connection and can move that connection there, as Jaz's Tasks tab does.
func TestSwitchWorkspaceMovesTheConnection(t *testing.T) {
	c := newClient(t)
	_, out := c.do(`{ organization { id } }`, c.key)
	team, _ := get(out.Data, "organization.id").(string)
	pat := signUp(t, c, "pat")
	stranger := signUp(t, c, "sam")
	jaz := connect(t, c, pat)
	c.do(`mutation { organizationInviteCreate(input: { email: "pat@example.com" }) { success } }`, c.key)

	_, out = c.do(`{ workspaces { id current } }`, jaz)
	current := map[any]any{}
	for _, w := range get(out.Data, "workspaces").([]any) {
		current[w.(map[string]any)["id"]] = w.(map[string]any)["current"]
	}
	if len(current) != 2 || current[pat.WorkspaceID] != true || current[team] != false {
		t.Fatalf("workspaces should include the one pat was invited to: %+v %+v", out.Data, out.Errors)
	}
	if _, out = c.do(`mutation { workspaceSwitch(id: "`+team+`") { success } }`, jaz); get(out.Data, "workspaceSwitch.success") != true {
		t.Fatalf("switch: %+v", out.Errors)
	}
	_, out = c.do(`{ organization { id } viewer { email } }`, jaz)
	if get(out.Data, "organization.id") != team || get(out.Data, "viewer.email") != "pat@example.com" {
		t.Fatalf("the connection should now act in the team workspace: %+v %+v", out.Data, out.Errors)
	}

	rejected(t, c, map[string]string{
		`mutation { workspaceSwitch(id: "` + stranger.WorkspaceID + `") { success } }`: jaz,
		`mutation { workspaceSwitch(id: "` + team + `") { success } }`:                 c.key,
	})
}

// A person in two workspaces mints a command-line key by naming one.
func TestCreateKeyForEmailNamesTheWorkspace(t *testing.T) {
	c := newClient(t)
	keys := auth.NewService(c.store, auth.Config{PublicURL: "http://tasks.test"})
	signUp(t, c, "pat")
	c.do(`mutation { organizationInviteCreate(input: { email: "pat@example.com" }) { success } }`, c.key)
	_, out := c.do(`{ organization { name } }`, c.key)
	team, _ := get(out.Data, "organization.name").(string)
	jaz := connect(t, c, signUp(t, c, "pat"))
	c.do(`{ workspaces { id } }`, jaz)

	if _, err := keys.CreateKeyForEmail(context.Background(), "pat@example.com", ""); err == nil {
		t.Fatal("a person in two workspaces needs the workspace named")
	}
	key, err := keys.CreateKeyForEmail(context.Background(), "pat@example.com", strings.ToUpper(team))
	if err != nil {
		t.Fatal(err)
	}
	if _, out := c.do(`{ organization { name } viewer { email } }`, key); get(out.Data, "organization.name") != team || get(out.Data, "viewer.email") != "pat@example.com" {
		t.Fatalf("key for the named workspace acts in: %+v %+v", out.Data, out.Errors)
	}
}

// A deployment's OWNER_EMAIL account and OWNER_API_KEY: provisioned once,
// usable at once, rotated by replacing the key, and claimed by the person's
// first sign-in with that email.
func TestProvisionedOwner(t *testing.T) {
	c := newClient(t)
	ctx := context.Background()
	people := workspaces.NewService(c.store, workspaces.Config{})
	keys := auth.NewService(c.store, auth.Config{PublicURL: "http://tasks.test"})
	viewer := func(key string) any {
		_, out := c.do(`{ viewer { email } }`, key)
		return get(out.Data, "viewer.email")
	}

	owner, err := people.Provision(ctx, "owner@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if again, err := people.Provision(ctx, "owner@example.com"); err != nil || again.ID != owner.ID {
		t.Fatalf("provisioning again = %+v, %v; want the same account", again, err)
	}
	first := strings.Repeat("a1", 32)
	for range 2 {
		if err := keys.ProvisionKey(ctx, owner.ID, "OWNER_API_KEY", first); err != nil {
			t.Fatal(err)
		}
	}
	if viewer(first) != "owner@example.com" || viewer("Bearer "+first) != "owner@example.com" {
		t.Fatal("the provisioned key does not act as the owner")
	}
	second := strings.Repeat("b2", 32)
	if err := keys.ProvisionKey(ctx, owner.ID, "OWNER_API_KEY", second); err != nil {
		t.Fatal(err)
	}
	if viewer(first) != nil || viewer(second) != "owner@example.com" {
		t.Fatal("replacing OWNER_API_KEY should retire the previous key")
	}
	if list, _ := c.store.APIKeys(ctx, owner.ID); len(list) != 1 {
		t.Fatalf("owner keys = %+v, want only the current one", list)
	}
	if err := keys.ProvisionKey(ctx, owner.ID, "OWNER_API_KEY", "short"); err == nil {
		t.Fatal("a short OWNER_API_KEY should be refused")
	}
	other, err := people.Provision(ctx, "other@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if err := keys.ProvisionKey(ctx, other.ID, "OWNER_API_KEY", second); err == nil {
		t.Fatal("another account's key should be refused")
	}

	for range 2 {
		user, err := people.SignIn(ctx, auth.Identity{Issuer: "google", Subject: "owner-sub", Email: "OWNER@example.com", EmailVerified: true, Name: "Owner"})
		if err != nil || user.ID != owner.ID {
			t.Fatalf("signing in with the owner's email = %+v, %v; want the provisioned account", user, err)
		}
	}
}
