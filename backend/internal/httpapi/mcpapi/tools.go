package mcpapi

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func register(server *mcp.Server, t tools) {
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true}
	addTool(server, &mcp.Tool{Name: "list_teams", Title: "List teams", Annotations: readOnly,
		Description: "List teams with their key, workflow states and the labels their issues can use."}, t.listTeams)
	addTool(server, &mcp.Tool{Name: "list_users", Title: "List users", Annotations: readOnly,
		Description: "List workspace members who can be assigned issues."}, t.listUsers)
	addTool(server, &mcp.Tool{Name: "list_projects", Title: "List projects", Annotations: readOnly,
		Description: "List projects with their one-line description, status, lead, teams, start and target dates and progress."}, t.listProjects)
	addTool(server, &mcp.Tool{Name: "get_project", Title: "Get project", Annotations: readOnly,
		Description: "Get one project with its content: the markdown brief with its goals, scope and plan. list_issues with project lists its issues."}, t.getProject)
	addTool(server, &mcp.Tool{Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false)}, Name: "create_project", Title: "Create project",
		Description: "Create a project for one or more teams, with a one-line description and the full brief as markdown content."}, t.createProject)
	addTool(server, &mcp.Tool{Name: "update_project", Title: "Update project",
		Description: `Update a project. Omitted fields stay unchanged; content replaces the whole brief. Pass "none" to clear lead, start date or target date, and an empty string to clear description or content.`}, t.updateProject)
	addTool(server, &mcp.Tool{Name: "list_issues", Title: "List issues", Annotations: readOnly,
		Description: "List issues, newest first, filtered by team, state, assignee, project, label, priority or a full-text query."}, t.listIssues)
	addTool(server, &mcp.Tool{Name: "get_issue", Title: "Get issue", Annotations: readOnly,
		Description: "Get one issue with its description, sub-issues and comments."}, t.getIssue)
	addTool(server, &mcp.Tool{Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false)}, Name: "create_issue", Title: "Create issue",
		Description: "Create an issue in a team. Unset state defaults to the team's Todo state.",
		Meta:        mcp.Meta{"ui": map[string]any{"resourceUri": issueCardURI}, "ui/resourceUri": issueCardURI}}, t.createIssue)
	addTool(server, &mcp.Tool{Name: "update_issue", Title: "Update issue",
		Description: `Update an issue. Omitted fields stay unchanged; pass "none" to clear assignee, project, due date, estimate or parent.`}, t.updateIssue)
	addTool(server, &mcp.Tool{Annotations: &mcp.ToolAnnotations{DestructiveHint: new(false)}, Name: "add_comment", Title: "Add comment",
		Description: "Comment on an issue as the authenticated user. Markdown is supported."}, t.addComment)
}

type empty struct{}

type teamView struct {
	Key    string      `json:"key"`
	Name   string      `json:"name"`
	States []stateView `json:"states"`
	Labels []string    `json:"labels"`
}

type stateView struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type teamsOutput struct {
	Teams []teamView `json:"teams"`
}

func (t tools) listTeams(ctx context.Context, req *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, teamsOutput, error) {
	s := t.scope(req)
	teams, err := s.FindTeams(ctx, nil, false)
	if err != nil {
		return nil, teamsOutput{}, err
	}
	labels, err := s.FindIssueLabels(ctx, nil, false)
	if err != nil {
		return nil, teamsOutput{}, err
	}
	out := teamsOutput{Teams: []teamView{}}
	for _, team := range teams {
		view := teamView{Key: team.Key, Name: team.Name, States: []stateView{}, Labels: []string{}}
		states, err := s.TeamStates(ctx, team.ID)
		if err != nil {
			return nil, teamsOutput{}, err
		}
		for _, st := range states {
			view.States = append(view.States, stateView{Name: st.Name, Type: st.Type})
		}
		for _, label := range labels {
			if !label.IsGroup && (label.TeamID == nil || *label.TeamID == team.ID) {
				view.Labels = append(view.Labels, label.Name)
			}
		}
		out.Teams = append(out.Teams, view)
	}
	return nil, out, nil
}

type userView struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	IsMe        bool   `json:"isMe"`
}

type usersOutput struct {
	Users []userView `json:"users"`
}

func (t tools) listUsers(ctx context.Context, req *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, usersOutput, error) {
	s := t.scope(req)
	users, err := s.FindUsers(ctx, &tracker.UserFilter{Active: &tracker.BooleanComparator{Eq: ptr(true)}})
	out := usersOutput{Users: []userView{}}
	for _, u := range users {
		out.Users = append(out.Users, userView{Name: u.Name, DisplayName: u.DisplayName, Email: u.Email, IsMe: u.ID == s.Actor().UserID})
	}
	return nil, out, err
}

type listIssuesInput struct {
	Team            string `json:"team,omitempty" jsonschema:"team key or name, e.g. ENG"`
	State           string `json:"state,omitempty" jsonschema:"state name such as In Progress, or a state type: triage, backlog, unstarted, started, completed, canceled"`
	Assignee        string `json:"assignee,omitempty" jsonschema:"me, none, or a person's name, display name or email"`
	Project         string `json:"project,omitempty" jsonschema:"project name or slug id"`
	Label           string `json:"label,omitempty" jsonschema:"label name"`
	Priority        *int32 `json:"priority,omitempty" jsonschema:"0 no priority, 1 urgent, 2 high, 3 medium, 4 low"`
	Query           string `json:"query,omitempty" jsonschema:"full-text search over identifier, title and description"`
	IncludeArchived bool   `json:"includeArchived,omitempty"`
	Limit           int32  `json:"limit,omitempty" jsonschema:"maximum issues to return, default 50, at most 250"`
}

type issuesOutput struct {
	Issues  []issueView `json:"issues"`
	HasMore bool        `json:"hasMore"`
}

var stateTypes = []string{"triage", "backlog", "unstarted", "started", "completed", "canceled"}

func (t tools) listIssues(ctx context.Context, req *mcp.CallToolRequest, in listIssuesInput) (*mcp.CallToolResult, issuesOutput, error) {
	s := t.scope(req)
	filter := &tracker.IssueFilter{}
	if in.Team != "" {
		team, err := resolveTeam(ctx, s, in.Team)
		if err != nil {
			return nil, issuesOutput{}, err
		}
		filter = filter.WithTeam(team.ID)
	}
	if in.State != "" {
		value := strings.ToLower(in.State)
		filter.State = &tracker.WorkflowStateFilter{Name: &tracker.StringComparator{EqIgnoreCase: &in.State}}
		for _, kind := range stateTypes {
			if kind == value {
				filter.State = &tracker.WorkflowStateFilter{Type: &tracker.StringComparator{Eq: &value}}
			}
		}
	}
	switch {
	case in.Assignee == "":
	case strings.EqualFold(in.Assignee, none):
		filter.Assignee = &tracker.UserFilter{Null: ptr(true)}
	default:
		user, err := resolveUser(ctx, s, in.Assignee)
		if err != nil {
			return nil, issuesOutput{}, err
		}
		filter = filter.WithAssignee(user.ID)
	}
	if in.Project != "" {
		project, err := resolveProject(ctx, s, in.Project)
		if err != nil {
			return nil, issuesOutput{}, err
		}
		filter = filter.WithProject(project.ID)
	}
	if in.Label != "" {
		filter.Labels = &tracker.IssueLabelFilter{Name: &tracker.StringComparator{EqIgnoreCase: &in.Label}}
	}
	if in.Priority != nil {
		filter.Priority = &tracker.NumberComparator{Eq: ptr(float64(*in.Priority))}
	}
	limit := in.Limit
	if limit == 0 {
		limit = 50
	}
	page, err := s.Issues(ctx, tracker.IssueQuery{
		Filter:          filter,
		Search:          in.Query,
		IncludeArchived: in.IncludeArchived,
		PageArgs:        tracker.PageArgs{First: &limit},
	})
	if err != nil {
		return nil, issuesOutput{}, err
	}
	views, err := presentAll(ctx, s, page.Nodes)
	return nil, issuesOutput{Issues: views, HasMore: page.PageInfo.HasNextPage}, err
}

type issueRef struct {
	Issue string `json:"issue" jsonschema:"issue identifier such as ENG-123, or its id"`
}

func (t tools) getIssue(ctx context.Context, req *mcp.CallToolRequest, in issueRef) (*mcp.CallToolResult, issueDetail, error) {
	s := t.scope(req)
	issue, err := s.Issue(ctx, in.Issue)
	if err != nil {
		return nil, issueDetail{}, err
	}
	out, err := detail(ctx, s, issue)
	return nil, out, err
}

type createIssueInput struct {
	Team        string   `json:"team" jsonschema:"team key or name, e.g. ENG"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty" jsonschema:"markdown"`
	State       string   `json:"state,omitempty" jsonschema:"workflow state name, e.g. Backlog or In Progress"`
	Priority    *int32   `json:"priority,omitempty" jsonschema:"0 no priority, 1 urgent, 2 high, 3 medium, 4 low"`
	Assignee    string   `json:"assignee,omitempty" jsonschema:"me, or a person's name, display name or email"`
	Labels      []string `json:"labels,omitempty" jsonschema:"label names"`
	Project     string   `json:"project,omitempty" jsonschema:"project name or slug id"`
	Estimate    *int32   `json:"estimate,omitempty"`
	DueDate     string   `json:"dueDate,omitempty" jsonschema:"YYYY-MM-DD"`
	Parent      string   `json:"parent,omitempty" jsonschema:"identifier of the parent issue, making this a sub-issue"`
}

func (t tools) createIssue(ctx context.Context, req *mcp.CallToolRequest, in createIssueInput) (*mcp.CallToolResult, issueDetail, error) {
	s := t.scope(req)
	team, err := resolveTeam(ctx, s, in.Team)
	if err != nil {
		return nil, issueDetail{}, err
	}
	create := tracker.IssueCreateInput{TeamID: team.ID, Title: &in.Title, Priority: in.Priority, Estimate: in.Estimate}
	if in.Description != "" {
		create.Description = &in.Description
	}
	if in.State != "" {
		state, err := resolveState(ctx, s, team.ID, in.State)
		if err != nil {
			return nil, issueDetail{}, err
		}
		create.StateID = &state.ID
	}
	if in.Assignee != "" {
		user, err := resolveUser(ctx, s, in.Assignee)
		if err != nil {
			return nil, issueDetail{}, err
		}
		create.AssigneeID = &user.ID
	}
	if in.Labels != nil {
		if create.LabelIDs, err = resolveLabels(ctx, s, in.Labels); err != nil {
			return nil, issueDetail{}, err
		}
	}
	if in.Project != "" {
		project, err := resolveProject(ctx, s, in.Project)
		if err != nil {
			return nil, issueDetail{}, err
		}
		create.ProjectID = &project.ID
	}
	if in.DueDate != "" {
		if create.DueDate, err = resolveDate(in.DueDate); err != nil {
			return nil, issueDetail{}, err
		}
	}
	if in.Parent != "" {
		create.ParentID = &in.Parent
	}
	issue, err := s.CreateIssue(ctx, create)
	if err != nil {
		return nil, issueDetail{}, err
	}
	out, err := detail(ctx, s, issue)
	if err != nil {
		return nil, issueDetail{}, err
	}
	return &mcp.CallToolResult{Meta: mcp.Meta{"jaz-tasks/stateColor": out.stateColor}}, out, nil
}

type updateIssueInput struct {
	Issue        string   `json:"issue" jsonschema:"issue identifier such as ENG-123, or its id"`
	Title        string   `json:"title,omitempty"`
	Description  *string  `json:"description,omitempty" jsonschema:"markdown; an empty string clears it"`
	State        string   `json:"state,omitempty" jsonschema:"workflow state name of the issue's team"`
	Priority     *int32   `json:"priority,omitempty" jsonschema:"0 no priority, 1 urgent, 2 high, 3 medium, 4 low"`
	Assignee     string   `json:"assignee,omitempty" jsonschema:"me, none, or a person's name, display name or email"`
	Labels       []string `json:"labels,omitempty" jsonschema:"replace all labels with these names"`
	AddLabels    []string `json:"addLabels,omitempty" jsonschema:"label names to add"`
	RemoveLabels []string `json:"removeLabels,omitempty" jsonschema:"label names to remove"`
	Project      string   `json:"project,omitempty" jsonschema:"project name or slug id, or none"`
	Estimate     string   `json:"estimate,omitempty" jsonschema:"points as a number, or none"`
	DueDate      string   `json:"dueDate,omitempty" jsonschema:"YYYY-MM-DD, or none"`
	Parent       string   `json:"parent,omitempty" jsonschema:"parent issue identifier, or none"`
	Team         string   `json:"team,omitempty" jsonschema:"move to another team by key or name"`
}

func (t tools) updateIssue(ctx context.Context, req *mcp.CallToolRequest, in updateIssueInput) (*mcp.CallToolResult, issueDetail, error) {
	s := t.scope(req)
	current, err := s.Issue(ctx, in.Issue)
	if err != nil {
		return nil, issueDetail{}, err
	}
	update, err := t.update(ctx, s, current, in)
	if err != nil {
		return nil, issueDetail{}, err
	}
	issue, err := s.UpdateIssue(ctx, current.ID, update)
	if err != nil {
		return nil, issueDetail{}, err
	}
	out, err := detail(ctx, s, issue)
	return nil, out, err
}

// update translates names and "none" into a tracker patch.
func (t tools) update(ctx context.Context, s *tracker.Scope, current storage.Issue, in updateIssueInput) (tracker.IssueUpdateInput, error) {
	var update tracker.IssueUpdateInput
	var err error
	if in.Title != "" {
		update.Title = &in.Title
	}
	if in.Description != nil {
		update.Description = tracker.Optional[string]{Set: true}
		if *in.Description != "" {
			update.Description.Value = in.Description
		}
	}
	if in.Priority != nil {
		update.Priority = tracker.Optional[int32]{Set: true, Value: in.Priority}
	}
	teamID := current.TeamID
	if in.Team != "" {
		team, err := resolveTeam(ctx, s, in.Team)
		if err != nil {
			return update, err
		}
		update.TeamID, teamID = &team.ID, team.ID
	}
	if in.State != "" {
		state, err := resolveState(ctx, s, teamID, in.State)
		if err != nil {
			return update, err
		}
		update.StateID = &state.ID
	}
	if update.AssigneeID, err = optional(in.Assignee, func(ref string) (string, error) {
		user, err := resolveUser(ctx, s, ref)
		return user.ID, err
	}); err != nil {
		return update, err
	}
	if update.ProjectID, err = optional(in.Project, func(ref string) (string, error) {
		project, err := resolveProject(ctx, s, ref)
		return project.ID, err
	}); err != nil {
		return update, err
	}
	if update.ParentID, err = optional(in.Parent, func(ref string) (string, error) {
		parent, err := s.Issue(ctx, ref)
		return parent.ID, err
	}); err != nil {
		return update, err
	}
	if update.Estimate, err = optional(in.Estimate, func(ref string) (int32, error) {
		var points int32
		_, err := fmt.Sscan(ref, &points)
		return points, err
	}); err != nil {
		return update, err
	}
	if update.DueDate, err = optional(in.DueDate, func(ref string) (time.Time, error) {
		date, err := resolveDate(ref)
		return deref(date), err
	}); err != nil {
		return update, err
	}
	for _, labels := range []struct {
		refs []string
		dst  *[]string
	}{{in.Labels, &update.LabelIDs}, {in.AddLabels, &update.AddedLabelIDs}, {in.RemoveLabels, &update.RemovedLabelIDs}} {
		if labels.refs != nil {
			if *labels.dst, err = resolveLabels(ctx, s, labels.refs); err != nil {
				return update, err
			}
		}
	}
	return update, nil
}

// optional maps an omitted value to unchanged, "none" to cleared and
// anything else through resolve.
func optional[T any](ref string, resolve func(string) (T, error)) (tracker.Optional[T], error) {
	if ref == "" {
		return tracker.Optional[T]{}, nil
	}
	if strings.EqualFold(ref, none) {
		return tracker.Optional[T]{Set: true}, nil
	}
	value, err := resolve(ref)
	if err != nil {
		return tracker.Optional[T]{}, err
	}
	return tracker.Optional[T]{Set: true, Value: &value}, nil
}

type addCommentInput struct {
	Issue string `json:"issue" jsonschema:"issue identifier such as ENG-123, or its id"`
	Body  string `json:"body" jsonschema:"markdown"`
}

func (t tools) addComment(ctx context.Context, req *mcp.CallToolRequest, in addCommentInput) (*mcp.CallToolResult, commentView, error) {
	s := t.scope(req)
	comment, err := s.CreateComment(ctx, tracker.CommentCreateInput{IssueID: &in.Issue, Body: &in.Body})
	if err != nil {
		return nil, commentView{}, err
	}
	return nil, presentComment(ctx, s, comment), nil
}

func ptr[T any](v T) *T {
	return &v
}
