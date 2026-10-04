package gql_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
)

func inbox(t *testing.T, c *client, key string) map[string]string {
	t.Helper()
	_, out := c.do(`{ inbox { issue { id identifier title state { type } } updatedAt revision } }`, key)
	if len(out.Errors) > 0 {
		t.Fatal(out.Errors)
	}
	updates := map[string]string{}
	for _, value := range out.Data["inbox"].([]any) {
		update := value.(map[string]any)
		updates[update["issue"].(map[string]any)["id"].(string)] = update["revision"].(string)
	}
	return updates
}

func TestInboxDismissalLifecycle(t *testing.T) {
	c := newClient(t)
	a := readA(t, c)
	updates := inbox(t, c, c.key)
	revision, ok := updates[a.issue]
	if !ok {
		t.Fatal("assigned issue missing from Inbox")
	}
	_, out := c.do(fmt.Sprintf(`mutation { inboxDismiss(input: [{ issueId: %q, revision: %q }]) }`, a.issue, revision), c.key)
	if len(out.Errors) > 0 || out.Data["inboxDismiss"] != true {
		t.Fatalf("dismiss: %+v", out)
	}
	if _, ok := inbox(t, c, c.key)[a.issue]; ok {
		t.Fatal("dismissed update still appears after a fresh request")
	}
	_, out = c.do(`{ issue(id: "`+a.issue+`") { id title archivedAt state { type } } }`, c.key)
	if len(out.Errors) > 0 || get(out.Data, "issue.id") != a.issue || get(out.Data, "issue.archivedAt") != nil || get(out.Data, "issue.state.type") != "completed" {
		t.Fatalf("dismissal changed the issue: %+v", out)
	}
	_, out = c.do(`mutation { commentCreate(input: { issueId: "`+a.issue+`", body: "New information after dismissal" }) { success } }`, c.key)
	if len(out.Errors) > 0 {
		t.Fatal(out.Errors)
	}
	newRevision, ok := inbox(t, c, c.key)[a.issue]
	newTime, _ := time.Parse(time.RFC3339Nano, newRevision)
	oldTime, _ := time.Parse(time.RFC3339Nano, revision)
	if !ok || !newTime.After(oldTime) {
		t.Fatal("new comment did not bring the issue back")
	}
	_, out = c.do(fmt.Sprintf(`mutation { inboxDismiss(input: [{ issueId: %q, revision: %q }]) }`, a.issue, revision), c.key)
	if len(out.Errors) > 0 {
		t.Fatal(out.Errors)
	}
	if inbox(t, c, c.key)[a.issue] != newRevision {
		t.Fatal("dismissing an older update hid a newer comment")
	}
	_, out = c.do(fmt.Sprintf(`mutation { inboxDismiss(input: [{ issueId: %q, revision: %q }]) }`, a.issue, newRevision), c.key)
	if len(out.Errors) > 0 {
		t.Fatal(out.Errors)
	}
	_, out = c.do(`mutation { issueUpdate(id: "`+a.issue+`", input: { title: "Changed after dismissal" }) { success } }`, c.key)
	if len(out.Errors) > 0 {
		t.Fatal(out.Errors)
	}
	if _, ok := inbox(t, c, c.key)[a.issue]; !ok {
		t.Fatal("new issue change did not bring the issue back")
	}
}

func TestInboxDismissalIsolationAndAtomicity(t *testing.T) {
	c := newClient(t)
	a := readA(t, c)
	ctx := context.Background()
	_, out := c.do(`{ users(filter: { displayName: { eq: "jonas" } }) { nodes { id } } }`, c.key)
	otherUser := get(out.Data, "users.nodes.0.id").(string)
	_, out = c.do(`mutation { issueUpdate(id: "`+a.issue+`", input: { assigneeId: "`+otherUser+`" }) { success } }`, c.key)
	if len(out.Errors) > 0 {
		t.Fatal(out.Errors)
	}
	otherKey, _, err := auth.NewService(c.store, auth.Config{PublicURL: "http://tasks.test"}).CreateKey(ctx, otherUser, "assignee", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := inbox(t, c, otherKey)[a.issue]; !ok {
		t.Fatal("assignee did not receive the issue update")
	}
	updates := inbox(t, c, c.key)
	foreignKey, foreign := tenantB(t, c.store)
	foreignRevision := inbox(t, c, foreignKey)[foreign.ID]
	_, out = c.do(fmt.Sprintf(`mutation { inboxDismiss(input: [{ issueId: %q, revision: %q }, { issueId: %q, revision: %q }]) }`,
		a.issue, updates[a.issue], foreign.ID, foreignRevision), c.key)
	if len(out.Errors) == 0 {
		t.Fatal("cross-workspace dismissal succeeded")
	}
	if inbox(t, c, c.key)[a.issue] != updates[a.issue] {
		t.Fatal("failed batch partially dismissed an update")
	}
	for _, revision := range []string{"not-a-revision", time.Now().Add(time.Hour).Format(time.RFC3339Nano)} {
		_, out = c.do(fmt.Sprintf(`mutation { inboxDismiss(input: [{ issueId: %q, revision: %q }]) }`, a.issue, revision), c.key)
		if len(out.Errors) == 0 {
			t.Fatalf("invalid revision accepted: %s", revision)
		}
	}
	input := ""
	for id, revision := range updates {
		input += fmt.Sprintf(`{ issueId: %q, revision: %q },`, id, revision)
	}
	_, out = c.do(`mutation { inboxDismiss(input: [`+input+`]) }`, c.key)
	if len(out.Errors) > 0 || len(inbox(t, c, c.key)) != 0 {
		t.Fatalf("bulk dismissal failed: %+v", out)
	}
	if _, ok := inbox(t, c, otherKey)[a.issue]; !ok {
		t.Fatal("one viewer's dismissal affected another viewer")
	}
	if inbox(t, c, foreignKey)[foreign.ID] != foreignRevision {
		t.Fatal("dismissal affected another workspace")
	}
}
