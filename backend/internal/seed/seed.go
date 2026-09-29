// Package seed creates the demo workspace a fresh deployment starts with.
package seed

import (
	"context"
	"fmt"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

// Result is what a caller needs to reach the seeded workspace.
type Result struct {
	APIKey string
	Actor  auth.Actor
}

// Run seeds an empty database and reports ok=false when data already exists.
// An empty apiKey generates one.
func Run(ctx context.Context, store storage.TrackerStore, keys *auth.Service, svc *tracker.Service, apiKey string) (Result, bool, error) {
	count, err := store.CountWorkspaces(ctx)
	if err != nil || count > 0 {
		return Result{}, false, err
	}
	workspace, err := store.CreateWorkspace(ctx, "Jaz", "jaz")
	if err != nil {
		return Result{}, false, err
	}
	users := map[string]storage.User{}
	for _, u := range people {
		created, err := store.CreateUser(ctx, storage.NewUser{
			WorkspaceID: workspace.ID,
			Name:        u.name,
			DisplayName: u.handle,
			Email:       u.handle + "@jaz.local",
			Admin:       u.handle == "mira",
		})
		if err != nil {
			return Result{}, false, err
		}
		users[u.handle] = created
	}
	actor := auth.Actor{UserID: users["mira"].ID, WorkspaceID: workspace.ID}
	if apiKey, _, err = keys.CreateKey(ctx, actor.UserID, "Seeded development key", apiKey); err != nil {
		return Result{}, false, err
	}
	if err := populate(ctx, svc, workspace.ID, users, time.Now()); err != nil {
		return Result{}, false, fmt.Errorf("seed demo data: %w", err)
	}
	return Result{APIKey: apiKey, Actor: actor}, true, nil
}

type person struct {
	name   string
	handle string
}

var people = []person{
	{"Mira Chen", "mira"},
	{"Jonas Petrauskas", "jonas"},
	{"Sofia Alvarez", "sofia"},
	{"Kai Nakamura", "kai"},
	{"Amara Okafor", "amara"},
}

type issueSeed struct {
	team     string
	title    string
	state    string
	priority int32
	assignee string
	labels   []string
	project  string
	cycle    int
	estimate int32
	due      int
	body     string
	parent   string
	comments []commentSeed
}

type commentSeed struct {
	author string
	body   string
}

func populate(ctx context.Context, svc *tracker.Service, workspaceID string, users map[string]storage.User, now time.Time) error {
	scopes := map[string]*tracker.Scope{}
	for handle, u := range users {
		scopes[handle] = svc.Scope(auth.Actor{UserID: u.ID, WorkspaceID: workspaceID})
	}
	s := scopes["mira"]
	teams := map[string]storage.Team{}
	for _, t := range []tracker.TeamCreateInput{
		{Name: "Engineering", Key: ptr("ENG"), Icon: ptr("Cpu"), Color: ptr("#5e6ad2")},
		{Name: "Design", Key: ptr("DES"), Icon: ptr("Palette"), Color: ptr("#f2994a")},
	} {
		team, err := s.CreateTeam(ctx, t)
		if err != nil {
			return err
		}
		teams[team.Key] = team
	}
	labels := map[string]string{}
	for _, l := range []tracker.IssueLabelCreateInput{
		{Name: "Bug", Color: ptr("#eb5757")},
		{Name: "Feature", Color: ptr("#bb87fc")},
		{Name: "Improvement", Color: ptr("#4ea7fc")},
		{Name: "Performance", Color: ptr("#f2994a")},
		{Name: "Docs", Color: ptr("#4cb782")},
		{Name: "Polish", Color: ptr("#f7c8c1"), TeamID: ptr(teams["DES"].ID)},
	} {
		label, err := s.CreateIssueLabel(ctx, l)
		if err != nil {
			return err
		}
		labels[label.Name] = label.ID
	}
	day := func(offset int) *time.Time {
		d := time.Date(now.Year(), now.Month(), now.Day()+offset, 0, 0, 0, 0, time.UTC)
		return &d
	}
	projects := map[string]string{}
	for _, p := range []tracker.ProjectCreateInput{
		{Name: "Tasks MVP", Description: ptr("Ship a Linear-quality tracker that humans and agents share."), Icon: ptr("Rocket"), Color: ptr("#5e6ad2"), StatusID: ptr("started"), LeadID: ptr(users["mira"].ID), TeamIDs: []string{teams["ENG"].ID, teams["DES"].ID}, Priority: ptr(int32(1)), StartDate: day(-21), TargetDate: day(18)},
		{Name: "Desktop embedding", Description: ptr("Host Jaz Tasks as a full-screen app inside the Jaz desktop rail."), Icon: ptr("AppWindow"), Color: ptr("#26b5ce"), StatusID: ptr("planned"), LeadID: ptr(users["jonas"].ID), TeamIDs: []string{teams["ENG"].ID}, Priority: ptr(int32(2)), StartDate: day(14), TargetDate: day(45)},
		{Name: "Agent workflows", Description: ptr("Let agents triage, plan and close issues through MCP."), Icon: ptr("Bot"), Color: ptr("#bb87fc"), StatusID: ptr("backlog"), LeadID: ptr(users["kai"].ID), TeamIDs: []string{teams["ENG"].ID}, Priority: ptr(int32(3))},
	} {
		project, err := s.CreateProject(ctx, p)
		if err != nil {
			return err
		}
		projects[project.Name] = project.ID
	}
	cycles := map[int]string{}
	start := time.Date(now.Year(), now.Month(), now.Day()-int(now.Weekday())+1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, -14)
	for i := range 3 {
		cycle, err := s.CreateCycle(ctx, tracker.CycleCreateInput{
			TeamID:   teams["ENG"].ID,
			StartsAt: start.AddDate(0, 0, 14*i),
			EndsAt:   start.AddDate(0, 0, 14*(i+1)),
		})
		if err != nil {
			return err
		}
		cycles[i+1] = cycle.ID
	}
	states := map[string]map[string]string{}
	for key, team := range teams {
		teamStates, err := s.TeamStates(ctx, team.ID)
		if err != nil {
			return err
		}
		states[key] = map[string]string{}
		for _, st := range teamStates {
			states[key][st.Name] = st.ID
		}
	}
	created := map[string]string{}
	for i, seed := range issues {
		in := tracker.IssueCreateInput{
			TeamID:    teams[seed.team].ID,
			Title:     ptr(seed.title),
			StateID:   ptr(states[seed.team]["Todo"]),
			Priority:  ptr(seed.priority),
			SortOrder: ptr(float64(i)),
		}
		if seed.body != "" {
			in.Description = ptr(seed.body)
		}
		if seed.assignee != "" {
			in.AssigneeID = ptr(users[seed.assignee].ID)
		}
		for _, l := range seed.labels {
			in.LabelIDs = append(in.LabelIDs, labels[l])
		}
		if seed.project != "" {
			in.ProjectID = ptr(projects[seed.project])
		}
		if seed.cycle > 0 {
			in.CycleID = ptr(cycles[seed.cycle])
		}
		if seed.estimate > 0 {
			in.Estimate = ptr(seed.estimate)
		}
		if seed.due != 0 {
			in.DueDate = day(seed.due)
		}
		if seed.parent != "" {
			in.ParentID = ptr(created[seed.parent])
		}
		author := scopes[[]string{"mira", "jonas", "sofia", "kai"}[i%4]]
		issue, err := author.CreateIssue(ctx, in)
		if err != nil {
			return fmt.Errorf("%s: %w", seed.title, err)
		}
		created[seed.title] = issue.ID
		if seed.state != "Todo" {
			if _, err := author.UpdateIssue(ctx, issue.ID, tracker.IssueUpdateInput{StateID: ptr(states[seed.team][seed.state])}); err != nil {
				return err
			}
		}
		for _, c := range seed.comments {
			if _, err := scopes[c.author].CreateComment(ctx, tracker.CommentCreateInput{IssueID: &issue.ID, Body: ptr(c.body)}); err != nil {
				return err
			}
		}
	}
	return nil
}

func ptr[T any](v T) *T {
	return &v
}

var issues = []issueSeed{
	{team: "ENG", title: "Linear-compatible GraphQL endpoint", state: "Done", priority: 1, assignee: "mira", labels: []string{"Feature"}, project: "Tasks MVP", cycle: 1, estimate: 5,
		body:     "Serve `/graphql` with the subset of Linear's schema that existing clients use.\n\n- `issues`, `issue`, `issueCreate`, `issueUpdate`\n- `teams`, `workflowStates`, `users`, `viewer`\n- Connection shapes with `nodes` and `pageInfo`",
		comments: []commentSeed{{"jonas", "linear-cli fixtures pass against the local server now."}, {"mira", "Great, let's keep the fixtures as the contract test."}}},
	{team: "ENG", title: "Postgres schema and migrations", state: "Done", priority: 2, assignee: "jonas", labels: []string{"Feature"}, project: "Tasks MVP", cycle: 1, estimate: 3},
	{team: "ENG", title: "API key authentication", state: "Done", priority: 2, assignee: "kai", labels: []string{"Feature"}, project: "Tasks MVP", cycle: 1, estimate: 2},
	{team: "ENG", title: "Issue list grouped by status", state: "In Review", priority: 1, assignee: "sofia", labels: []string{"Feature"}, project: "Tasks MVP", cycle: 2, estimate: 3, due: 2,
		body:     "Group issues by workflow state in the team's order, with collapsible headers and counts.\n\nKeyboard: `j`/`k` to move, `enter` to open.",
		comments: []commentSeed{{"mira", "Headers should stick while scrolling, like Linear."}, {"sofia", "Done — also added the add-issue button on each group."}}},
	{team: "ENG", title: "Board view with drag and drop", state: "In Progress", priority: 2, assignee: "sofia", labels: []string{"Feature"}, project: "Tasks MVP", cycle: 2, estimate: 5, due: 5},
	{team: "ENG", title: "Command palette", state: "In Progress", priority: 2, assignee: "jonas", labels: []string{"Feature"}, project: "Tasks MVP", cycle: 2, estimate: 3},
	{team: "ENG", title: "Optimistic updates for property pickers", state: "Todo", priority: 3, assignee: "jonas", labels: []string{"Improvement"}, project: "Tasks MVP", cycle: 2, estimate: 2},
	{team: "ENG", title: "Issue detail keyboard shortcuts", state: "Todo", priority: 3, assignee: "mira", labels: []string{"Improvement"}, project: "Tasks MVP", cycle: 2, estimate: 1},
	{team: "ENG", title: "Status changes lose sort order on board", state: "Todo", priority: 1, assignee: "sofia", labels: []string{"Bug"}, project: "Tasks MVP", cycle: 2, estimate: 1, due: 1,
		body: "Dragging a card into another column drops it at the bottom instead of where it was released.\n\n**Steps**\n1. Open the board\n2. Drag ENG-5 between two cards in *In Review*\n3. Card lands last"},
	{team: "ENG", title: "Slow issue list on large teams", state: "Backlog", priority: 2, labels: []string{"Performance"}, project: "Tasks MVP", estimate: 3},
	{team: "ENG", title: "MCP server for agents", state: "Todo", priority: 2, assignee: "kai", labels: []string{"Feature"}, project: "Agent workflows", cycle: 3, estimate: 5,
		body: "Expose list/search/get/create/update issue tools over Streamable HTTP at `/mcp`, backed by the same service layer as GraphQL."},
	{team: "ENG", title: "List and search tools", state: "Todo", priority: 2, assignee: "kai", project: "Agent workflows", cycle: 3, estimate: 2, parent: "MCP server for agents"},
	{team: "ENG", title: "Create and update tools", state: "Backlog", priority: 3, assignee: "kai", project: "Agent workflows", estimate: 2, parent: "MCP server for agents"},
	{team: "ENG", title: "Theme bridge for the Jaz host", state: "Backlog", priority: 2, assignee: "jonas", labels: []string{"Feature"}, project: "Desktop embedding", estimate: 3,
		body: "Accept `jaz:theme` postMessage events and apply the host's CSS variables."},
	{team: "ENG", title: "Sandboxed iframe embedding", state: "Backlog", priority: 3, project: "Desktop embedding", estimate: 2},
	{team: "ENG", title: "Document the GraphQL subset", state: "Backlog", priority: 4, assignee: "amara", labels: []string{"Docs"}},
	{team: "ENG", title: "Webhook notifications", state: "Backlog", priority: 0},
	{team: "ENG", title: "Crash when a label is deleted mid-edit", state: "Canceled", priority: 3, labels: []string{"Bug"}, cycle: 1},
	{team: "ENG", title: "Recurring issues", state: "Backlog", priority: 0, labels: []string{"Feature"}},
	{team: "ENG", title: "Import from Linear CSV export", state: "Backlog", priority: 4, labels: []string{"Feature"}, project: "Agent workflows"},
	{team: "DES", title: "Status and priority icon set", state: "Done", priority: 2, assignee: "amara", labels: []string{"Polish"}, project: "Tasks MVP", estimate: 2},
	{team: "DES", title: "Dark theme tokens", state: "In Progress", priority: 2, assignee: "amara", labels: []string{"Polish"}, project: "Tasks MVP", estimate: 2, due: 3,
		comments: []commentSeed{{"sofia", "Can we keep the border contrast a touch lower in dark mode?"}}},
	{team: "DES", title: "Empty states for views", state: "Todo", priority: 3, assignee: "amara", project: "Tasks MVP", estimate: 1},
	{team: "DES", title: "Issue detail layout review", state: "In Review", priority: 2, assignee: "sofia", project: "Tasks MVP", estimate: 1},
	{team: "DES", title: "Onboarding illustrations", state: "Backlog", priority: 4},
}
