package gql_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
)

func TestSavedViewsAreSharedAndWorkspaceScoped(t *testing.T) {
	c := newClient(t)
	a := readA(t, c)
	input := fmt.Sprintf(`{name: "  Customer work  ", teamId: %q, labelIds: [%q], layout: "board", grouping: "label", ordering: "priority", completedFilter: "all", dueDateFilter: "any", showEmpty: false}`, a.team, a.label)
	fields := "id name teamId labelIds layout grouping ordering completedFilter dueDateFilter showEmpty"
	_, out := c.do(`mutation { savedViewCreate(input: `+input+`) { `+fields+` } }`, c.key)
	if len(out.Errors) != 0 {
		t.Fatal(out.Errors)
	}
	created := out.Data["savedViewCreate"].(map[string]any)
	id := created["id"].(string)
	if created["name"] != "Customer work" || created["grouping"] != "label" || created["showEmpty"] != false || created["completedFilter"] != "all" || created["dueDateFilter"] != "any" {
		t.Fatalf("display settings not saved: %+v", created)
	}
	_, out = c.do(`{ users { nodes { id isMe } } }`, c.key)
	var teammate string
	for _, value := range get(out.Data, "users.nodes").([]any) {
		user := value.(map[string]any)
		if user["isMe"] == false {
			teammate = user["id"].(string)
			break
		}
	}
	key, _, err := auth.NewService(c.store, auth.Config{PublicURL: "http://tasks.test"}).CreateKey(context.Background(), teammate, "view reader", "")
	if err != nil {
		t.Fatal(err)
	}
	_, out = c.do(`{ savedViews { `+fields+` } }`, key)
	if len(out.Errors) != 0 || len(out.Data["savedViews"].([]any)) != 1 || out.Data["savedViews"].([]any)[0].(map[string]any)["id"] != id {
		t.Fatalf("teammate cannot read saved view: %+v", out)
	}
	updated := `{showEmpty: true, grouping: "state", completedFilter: "week", dueDateFilter: "week"}`
	_, out = c.do(fmt.Sprintf(`mutation { savedViewUpdate(id: %q, input: %s) { %s } }`, id, updated, fields), key)
	if len(out.Errors) != 0 {
		t.Fatal(out.Errors)
	}
	_, out = c.do(`{ savedViews { `+fields+` } }`, c.key)
	view := out.Data["savedViews"].([]any)[0].(map[string]any)
	if view["showEmpty"] != true || view["grouping"] != "state" || view["layout"] != "board" || view["ordering"] != "priority" ||
		view["completedFilter"] != "week" || view["dueDateFilter"] != "week" {
		t.Fatalf("teammate's edits did not persist: %+v", view)
	}
	foreignKey, foreign := tenantB(t, c.store)
	_, out = c.do(`{ savedViews { id } }`, foreignKey)
	if len(out.Errors) != 0 || len(out.Data["savedViews"].([]any)) != 0 {
		t.Fatalf("view leaked to another workspace: %+v", out)
	}
	foreignInput := strings.ReplaceAll(strings.ReplaceAll(input, a.team, foreign.TeamID), fmt.Sprintf(`[%q]`, a.label), `[]`)
	for _, query := range []string{
		fmt.Sprintf(`mutation { savedViewUpdate(id: %q, input: %s) { id } }`, id, foreignInput),
		fmt.Sprintf(`mutation { savedViewDelete(id: %q) { success } }`, id),
		`mutation { savedViewCreate(input: ` + input + `) { id } }`,
		`mutation { savedViewCreate(input: ` + strings.ReplaceAll(input, a.team, foreign.TeamID) + `) { id } }`,
	} {
		_, out = c.do(query, foreignKey)
		if len(out.Errors) == 0 {
			t.Fatalf("cross-workspace operation succeeded: %s", query)
		}
	}
	for _, invalid := range []string{
		strings.ReplaceAll(input, "Customer work", " "),
		strings.ReplaceAll(input, `layout: "board"`, `layout: "invalid"`),
		strings.ReplaceAll(input, `grouping: "label"`, `grouping: "invalid"`),
		strings.ReplaceAll(input, `ordering: "priority"`, `ordering: "invalid"`),
		strings.ReplaceAll(input, `completedFilter: "all"`, `completedFilter: "invalid"`),
		strings.ReplaceAll(input, `dueDateFilter: "any"`, `dueDateFilter: "invalid"`),
	} {
		_, out = c.do(`mutation { savedViewCreate(input: `+invalid+`) { id } }`, c.key)
		if len(out.Errors) == 0 || out.Errors[0].Extensions["code"] != "INPUT_ERROR" {
			t.Fatalf("invalid view accepted: %+v", out)
		}
	}
	_, out = c.do(fmt.Sprintf(`mutation { savedViewDelete(id: %q) { success } }`, id), key)
	if len(out.Errors) != 0 || get(out.Data, "savedViewDelete.success") != true {
		t.Fatalf("delete failed: %+v", out)
	}
	_, out = c.do(`{ savedViews { id } }`, c.key)
	if len(out.Errors) != 0 || len(out.Data["savedViews"].([]any)) != 0 {
		t.Fatalf("deletion not shared: %+v", out)
	}
}

func TestSavedViewUpdatesPreserveUnchangedFields(t *testing.T) {
	c := newClient(t)
	a := readA(t, c)
	_, out := c.do(fmt.Sprintf(`mutation { savedViewCreate(input: {name: "Shared", teamId: %q, labelIds: [%q], layout: "board", grouping: "label", ordering: "manual", completedFilter: "all", dueDateFilter: "any", showEmpty: false}) { id } }`, a.team, a.label), c.key)
	if len(out.Errors) != 0 {
		t.Fatal(out.Errors)
	}
	id := get(out.Data, "savedViewCreate.id").(string)
	for _, patch := range []string{`{name: "Renamed"}`, `{showEmpty: true}`, `{layout: "list", completedFilter: "hidden"}`} {
		_, out = c.do(fmt.Sprintf(`mutation { savedViewUpdate(id: %q, input: %s) { id } }`, id, patch), c.key)
		if len(out.Errors) != 0 {
			t.Fatalf("partial update failed: %+v", out.Errors)
		}
	}
	_, out = c.do(`{ savedViews { name teamId labelIds layout grouping ordering completedFilter dueDateFilter showEmpty } }`, c.key)
	view := out.Data["savedViews"].([]any)[0].(map[string]any)
	if view["name"] != "Renamed" || view["teamId"] != a.team || view["grouping"] != "label" || view["ordering"] != "manual" ||
		view["showEmpty"] != true || view["completedFilter"] != "hidden" || view["dueDateFilter"] != "any" || view["layout"] != "list" || view["labelIds"].([]any)[0] != a.label {
		t.Fatalf("partial update erased another edit: %+v", view)
	}
	_, out = c.do(fmt.Sprintf(`mutation { savedViewUpdate(id: %q, input: {teamId: null, labelIds: []}) { teamId labelIds } }`, id), c.key)
	if len(out.Errors) != 0 || get(out.Data, "savedViewUpdate.teamId") != nil || len(get(out.Data, "savedViewUpdate.labelIds").([]any)) != 0 {
		t.Fatalf("clearing filters failed: %+v", out)
	}
	_, out = c.do(fmt.Sprintf(`mutation { savedViewUpdate(id: %q, input: {name: "Rejected", grouping: "invalid"}) { id } }`, id), c.key)
	if len(out.Errors) == 0 || out.Errors[0].Extensions["code"] != "INPUT_ERROR" {
		t.Fatalf("invalid update accepted: %+v", out)
	}
	_, out = c.do(`{ savedViews { name grouping } }`, c.key)
	view = out.Data["savedViews"].([]any)[0].(map[string]any)
	if view["name"] != "Renamed" || view["grouping"] != "label" {
		t.Fatalf("rejected update partially wrote a view: %+v", view)
	}
}

func TestDeletedLabelsLeaveNoSavedViewReferences(t *testing.T) {
	c := newClient(t)
	a := readA(t, c)
	_, out := c.do(fmt.Sprintf(`mutation { savedViewCreate(input: {name: "Shared", labelIds: [%q], layout: "board", grouping: "label", ordering: "manual", completedFilter: "all", dueDateFilter: "any", showEmpty: false}) { id } }`, a.label), c.key)
	if len(out.Errors) != 0 {
		t.Fatal(out.Errors)
	}
	_, out = c.do(fmt.Sprintf(`mutation { issueLabelDelete(id: %q) { success } }`, a.label), c.key)
	if len(out.Errors) != 0 {
		t.Fatal(out.Errors)
	}
	_, out = c.do(`{ savedViews { labelIds } }`, c.key)
	if labels := out.Data["savedViews"].([]any)[0].(map[string]any)["labelIds"].([]any); len(labels) != 0 {
		t.Fatalf("deleted label remains in shared filter: %+v", labels)
	}
}
