package mcpapi

import (
	"context"
	"time"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type projectView struct {
	Name        string   `json:"name"`
	SlugID      string   `json:"slugId"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status"`
	Lead        string   `json:"lead,omitempty"`
	Teams       []string `json:"teams"`
	StartDate   string   `json:"startDate,omitempty"`
	TargetDate  string   `json:"targetDate,omitempty"`
	Progress    float64  `json:"progress"`
	URL         string   `json:"url"`
}

type projectDetail struct {
	projectView
	ID        string `json:"id"`
	Priority  string `json:"priority"`
	Content   string `json:"content,omitempty"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type projectsOutput struct {
	Projects []projectView `json:"projects"`
}

func presentProject(ctx context.Context, s *tracker.Scope, p storage.Project) (projectView, error) {
	view := projectView{
		Name:        p.Name,
		SlugID:      p.SlugID,
		Description: p.Description,
		Status:      tracker.ProjectStatusOf(p).Name,
		Teams:       []string{},
		StartDate:   day(p.StartDate),
		TargetDate:  day(p.TargetDate),
		URL:         s.URL("/project/" + p.SlugID),
	}
	if p.LeadID != nil {
		if lead, err := s.User(ctx, *p.LeadID); err == nil {
			view.Lead = lead.Name
		}
	}
	for _, id := range p.TeamIDs {
		if team, err := s.Team(ctx, id); err == nil {
			view.Teams = append(view.Teams, team.Key)
		}
	}
	var err error
	view.Progress, err = s.ProjectProgress(ctx, p.ID)
	return view, err
}

func projectDetailOf(ctx context.Context, s *tracker.Scope, p storage.Project) (projectDetail, error) {
	view, err := presentProject(ctx, s, p)
	return projectDetail{
		projectView: view,
		ID:          p.ID,
		Priority:    priorityNames[p.Priority],
		Content:     deref(p.Content),
		CreatedAt:   p.CreatedAt.UTC().Format(timeLayout),
		UpdatedAt:   p.UpdatedAt.UTC().Format(timeLayout),
	}, err
}

func (t tools) listProjects(ctx context.Context, req *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, projectsOutput, error) {
	s := t.scope(req)
	projects, err := s.FindProjects(ctx, nil, false)
	if err != nil {
		return nil, projectsOutput{}, err
	}
	out := projectsOutput{Projects: []projectView{}}
	for _, p := range projects {
		view, err := presentProject(ctx, s, p)
		if err != nil {
			return nil, projectsOutput{}, err
		}
		out.Projects = append(out.Projects, view)
	}
	return nil, out, nil
}

type projectRef struct {
	Project string `json:"project" jsonschema:"project name or slug id"`
}

func (t tools) getProject(ctx context.Context, req *mcp.CallToolRequest, in projectRef) (*mcp.CallToolResult, projectDetail, error) {
	s := t.scope(req)
	project, err := resolveProject(ctx, s, in.Project)
	if err != nil {
		return nil, projectDetail{}, err
	}
	out, err := projectDetailOf(ctx, s, project)
	return nil, out, err
}

type createProjectInput struct {
	Name        string   `json:"name"`
	Teams       []string `json:"teams" jsonschema:"keys or names of the teams working on it, e.g. ENG"`
	Description string   `json:"description,omitempty" jsonschema:"one-line summary"`
	Content     string   `json:"content,omitempty" jsonschema:"the project brief as markdown: goals, scope, plan and decisions"`
	Status      string   `json:"status,omitempty" jsonschema:"Backlog, Planned, In Progress, Paused, Completed or Canceled; default Planned"`
	Lead        string   `json:"lead,omitempty" jsonschema:"me, or a person's name, display name or email"`
	Priority    *int32   `json:"priority,omitempty" jsonschema:"0 no priority, 1 urgent, 2 high, 3 medium, 4 low"`
	StartDate   string   `json:"startDate,omitempty" jsonschema:"YYYY-MM-DD"`
	TargetDate  string   `json:"targetDate,omitempty" jsonschema:"YYYY-MM-DD"`
}

func (t tools) createProject(ctx context.Context, req *mcp.CallToolRequest, in createProjectInput) (*mcp.CallToolResult, projectDetail, error) {
	s := t.scope(req)
	create := tracker.ProjectCreateInput{Name: in.Name, Priority: in.Priority}
	if in.Description != "" {
		create.Description = &in.Description
	}
	if in.Content != "" {
		create.Content = &in.Content
	}
	if in.Status != "" {
		status, err := resolveProjectStatus(in.Status)
		if err != nil {
			return nil, projectDetail{}, err
		}
		create.StatusID = &status.ID
	}
	if in.Lead != "" {
		user, err := resolveUser(ctx, s, in.Lead)
		if err != nil {
			return nil, projectDetail{}, err
		}
		create.LeadID = &user.ID
	}
	var err error
	if create.TeamIDs, err = resolveTeams(ctx, s, in.Teams); err != nil {
		return nil, projectDetail{}, err
	}
	for _, date := range []struct {
		ref string
		dst **time.Time
	}{{in.StartDate, &create.StartDate}, {in.TargetDate, &create.TargetDate}} {
		if date.ref != "" {
			if *date.dst, err = resolveDate(date.ref); err != nil {
				return nil, projectDetail{}, err
			}
		}
	}
	project, err := s.CreateProject(ctx, create)
	if err != nil {
		return nil, projectDetail{}, err
	}
	out, err := projectDetailOf(ctx, s, project)
	return nil, out, err
}

type updateProjectInput struct {
	Project     string   `json:"project" jsonschema:"project name or slug id"`
	Name        string   `json:"name,omitempty"`
	Description *string  `json:"description,omitempty" jsonschema:"one-line summary; an empty string clears it"`
	Content     *string  `json:"content,omitempty" jsonschema:"the whole brief as markdown, replacing the current content; an empty string clears it"`
	Status      string   `json:"status,omitempty" jsonschema:"Backlog, Planned, In Progress, Paused, Completed or Canceled"`
	Lead        string   `json:"lead,omitempty" jsonschema:"me, none, or a person's name, display name or email"`
	Priority    *int32   `json:"priority,omitempty" jsonschema:"0 no priority, 1 urgent, 2 high, 3 medium, 4 low"`
	Teams       []string `json:"teams,omitempty" jsonschema:"replace the project's teams with these keys or names"`
	StartDate   string   `json:"startDate,omitempty" jsonschema:"YYYY-MM-DD, or none"`
	TargetDate  string   `json:"targetDate,omitempty" jsonschema:"YYYY-MM-DD, or none"`
}

func (t tools) updateProject(ctx context.Context, req *mcp.CallToolRequest, in updateProjectInput) (*mcp.CallToolResult, projectDetail, error) {
	s := t.scope(req)
	project, err := resolveProject(ctx, s, in.Project)
	if err != nil {
		return nil, projectDetail{}, err
	}
	update := tracker.ProjectUpdateInput{Description: in.Description, Priority: in.Priority}
	if in.Name != "" {
		update.Name = &in.Name
	}
	if in.Content != nil {
		update.Content = tracker.Optional[string]{Set: true}
		if *in.Content != "" {
			update.Content.Value = in.Content
		}
	}
	if in.Status != "" {
		status, err := resolveProjectStatus(in.Status)
		if err != nil {
			return nil, projectDetail{}, err
		}
		update.StatusID = &status.ID
	}
	if update.LeadID, err = optional(in.Lead, func(ref string) (string, error) {
		user, err := resolveUser(ctx, s, ref)
		return user.ID, err
	}); err != nil {
		return nil, projectDetail{}, err
	}
	if in.Teams != nil {
		if update.TeamIDs, err = resolveTeams(ctx, s, in.Teams); err != nil {
			return nil, projectDetail{}, err
		}
	}
	for _, date := range []struct {
		ref string
		dst *tracker.Optional[time.Time]
	}{{in.StartDate, &update.StartDate}, {in.TargetDate, &update.TargetDate}} {
		if *date.dst, err = optional(date.ref, func(ref string) (time.Time, error) {
			date, err := resolveDate(ref)
			return deref(date), err
		}); err != nil {
			return nil, projectDetail{}, err
		}
	}
	updated, err := s.UpdateProject(ctx, project.ID, update)
	if err != nil {
		return nil, projectDetail{}, err
	}
	out, err := projectDetailOf(ctx, s, updated)
	return nil, out, err
}
