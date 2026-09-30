package mcpapi

import (
	"context"
	"strconv"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

// Views name every reference so agents never juggle ids.

type issueView struct {
	Identifier string   `json:"identifier"`
	Title      string   `json:"title"`
	State      string   `json:"state"`
	StateType  string   `json:"stateType"`
	Priority   string   `json:"priority"`
	Assignee   string   `json:"assignee,omitempty"`
	Project    string   `json:"project,omitempty"`
	Labels     []string `json:"labels,omitempty"`
	DueDate    string   `json:"dueDate,omitempty"`
	Estimate   *int32   `json:"estimate,omitempty"`
	URL        string   `json:"url"`
	// stateColor reaches the inline issue card through the result's _meta.
	stateColor string
}

type issueDetail struct {
	issueView
	ID          string        `json:"id"`
	Team        string        `json:"team"`
	Description string        `json:"description,omitempty"`
	Cycle       string        `json:"cycle,omitempty"`
	Parent      string        `json:"parent,omitempty"`
	Creator     string        `json:"creator,omitempty"`
	CreatedAt   string        `json:"createdAt"`
	UpdatedAt   string        `json:"updatedAt"`
	SubIssues   []issueView   `json:"subIssues,omitempty"`
	Comments    []commentView `json:"comments,omitempty"`
}

type commentView struct {
	ID        string `json:"id"`
	Author    string `json:"author,omitempty"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

var priorityNames = []string{"No priority", "Urgent", "High", "Medium", "Low"}

func present(ctx context.Context, s *tracker.Scope, issue storage.Issue) (issueView, error) {
	identifier, err := s.Identifier(ctx, issue)
	if err != nil {
		return issueView{}, err
	}
	state, err := s.WorkflowState(ctx, issue.StateID)
	if err != nil {
		return issueView{}, err
	}
	view := issueView{
		Identifier: identifier,
		Title:      issue.Title,
		State:      state.Name,
		StateType:  state.Type,
		Priority:   priorityNames[issue.Priority],
		Estimate:   issue.Estimate,
		URL:        s.URL("/issue/" + identifier),
		stateColor: state.Color,
	}
	if issue.AssigneeID != nil {
		if user, err := s.User(ctx, *issue.AssigneeID); err == nil {
			view.Assignee = user.Name
		}
	}
	if issue.ProjectID != nil {
		if project, err := s.Project(ctx, *issue.ProjectID); err == nil {
			view.Project = project.Name
		}
	}
	for _, id := range issue.LabelIDs {
		if label, err := s.IssueLabel(ctx, id); err == nil {
			view.Labels = append(view.Labels, label.Name)
		}
	}
	if issue.DueDate != nil {
		view.DueDate = issue.DueDate.Format(dateLayout)
	}
	return view, nil
}

func presentAll(ctx context.Context, s *tracker.Scope, issues []storage.Issue) ([]issueView, error) {
	views := make([]issueView, 0, len(issues))
	for _, issue := range issues {
		view, err := present(ctx, s, issue)
		if err != nil {
			return nil, err
		}
		views = append(views, view)
	}
	return views, nil
}

func detail(ctx context.Context, s *tracker.Scope, issue storage.Issue) (issueDetail, error) {
	view, err := present(ctx, s, issue)
	if err != nil {
		return issueDetail{}, err
	}
	team, err := s.Team(ctx, issue.TeamID)
	if err != nil {
		return issueDetail{}, err
	}
	out := issueDetail{
		issueView:   view,
		ID:          issue.ID,
		Team:        team.Key,
		Description: deref(issue.Description),
		CreatedAt:   issue.CreatedAt.UTC().Format(timeLayout),
		UpdatedAt:   issue.UpdatedAt.UTC().Format(timeLayout),
	}
	if issue.CycleID != nil {
		if cycle, err := s.Cycle(ctx, *issue.CycleID); err == nil {
			out.Cycle = "Cycle " + strconv.Itoa(int(cycle.Number))
		}
	}
	if issue.ParentID != nil {
		if parent, err := s.Issue(ctx, *issue.ParentID); err == nil {
			out.Parent, _ = s.Identifier(ctx, parent)
		}
	}
	if issue.CreatorID != nil {
		if user, err := s.User(ctx, *issue.CreatorID); err == nil {
			out.Creator = user.Name
		}
	}
	children, err := s.Issues(ctx, tracker.IssueQuery{Filter: (*tracker.IssueFilter)(nil).WithParent(issue.ID)})
	if err != nil {
		return issueDetail{}, err
	}
	if out.SubIssues, err = presentAll(ctx, s, children.Nodes); err != nil {
		return issueDetail{}, err
	}
	comments, err := s.Comments(ctx, issue.ID)
	if err != nil {
		return issueDetail{}, err
	}
	for _, c := range comments {
		out.Comments = append(out.Comments, presentComment(ctx, s, c))
	}
	return out, nil
}

func presentComment(ctx context.Context, s *tracker.Scope, c storage.Comment) commentView {
	view := commentView{ID: c.ID, Body: c.Body, CreatedAt: c.CreatedAt.UTC().Format(timeLayout)}
	if c.UserID != nil {
		if user, err := s.User(ctx, *c.UserID); err == nil {
			view.Author = user.Name
		}
	}
	return view
}

const (
	dateLayout = "2006-01-02"
	timeLayout = "2006-01-02T15:04:05Z"
)

func deref[T any](v *T) T {
	var zero T
	if v == nil {
		return zero
	}
	return *v
}
