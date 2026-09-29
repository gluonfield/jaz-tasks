package tracker

import (
	"context"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

func (s *Scope) FindUsers(ctx context.Context, f *UserFilter) ([]storage.User, error) {
	users, err := s.Users(ctx)
	return filter(users, func(u storage.User) bool { return f.match(u, s.actor.UserID) }), err
}

func (s *Scope) FindTeams(ctx context.Context, f *TeamFilter, includeArchived bool) ([]storage.Team, error) {
	teams, err := s.Teams(ctx)
	return filter(teams, func(t storage.Team) bool { return live(t.ArchivedAt, includeArchived) && f.match(t) }), err
}

func (s *Scope) FindWorkflowStates(ctx context.Context, f *WorkflowStateFilter, includeArchived bool) ([]storage.WorkflowState, error) {
	states, err := s.WorkflowStates(ctx)
	if err != nil {
		return nil, err
	}
	teams, err := s.Teams(ctx)
	if err != nil {
		return nil, err
	}
	var stateTeams map[string]bool
	if f != nil {
		stateTeams = s.teamIDs(teams, f.Team)
	}
	return filter(states, func(st storage.WorkflowState) bool {
		return live(st.ArchivedAt, includeArchived) && s.matchState(f, st, stateTeams)
	}), nil
}

func (s *Scope) FindIssueLabels(ctx context.Context, f *IssueLabelFilter, includeArchived bool) ([]storage.IssueLabel, error) {
	labels, err := s.IssueLabels(ctx)
	if err != nil {
		return nil, err
	}
	teams, err := s.Teams(ctx)
	if err != nil {
		return nil, err
	}
	var labelTeams map[string]bool
	if f != nil {
		labelTeams = s.teamIDs(teams, f.Team)
	}
	return filter(labels, func(l storage.IssueLabel) bool {
		return live(l.ArchivedAt, includeArchived) && s.matchLabel(f, l, labels, labelTeams)
	}), nil
}

func (s *Scope) FindProjects(ctx context.Context, f *ProjectFilter, includeArchived bool) ([]storage.Project, error) {
	projects, err := s.Projects(ctx)
	if err != nil {
		return nil, err
	}
	users, err := s.Users(ctx)
	if err != nil {
		return nil, err
	}
	return filter(projects, func(p storage.Project) bool {
		return live(p.ArchivedAt, includeArchived) && s.matchProject(f, p, users)
	}), nil
}

func (s *Scope) FindCycles(ctx context.Context, f *CycleFilter, includeArchived bool) ([]storage.Cycle, error) {
	cycles, err := s.Cycles(ctx)
	if err != nil {
		return nil, err
	}
	teams, err := s.Teams(ctx)
	if err != nil {
		return nil, err
	}
	var cycleTeams map[string]bool
	if f != nil {
		cycleTeams = s.teamIDs(teams, f.Team)
	}
	now := s.svc.now()
	return filter(cycles, func(c storage.Cycle) bool {
		return live(c.ArchivedAt, includeArchived) && s.matchCycle(f, c, cycleTeams, now)
	}), nil
}

func live(archivedAt *time.Time, includeArchived bool) bool {
	return includeArchived || archivedAt == nil
}

// CycleActive reports whether now falls inside an uncompleted cycle.
func CycleActive(c storage.Cycle, now time.Time) bool {
	return c.CompletedAt == nil && !now.Before(c.StartsAt) && now.Before(c.EndsAt)
}

func (s *Scope) ProjectProgress(ctx context.Context, id string) (float64, error) {
	return s.progress(ctx, func(c storage.IssueCount) bool { return deref(c.ProjectID) == id })
}

func (s *Scope) CycleProgress(ctx context.Context, id string) (float64, error) {
	return s.progress(ctx, func(c storage.IssueCount) bool { return deref(c.CycleID) == id })
}

// progress is the completed share of the matching live, non-canceled issues.
func (s *Scope) progress(ctx context.Context, match func(storage.IssueCount) bool) (float64, error) {
	counts, err := s.counts.get(func() ([]storage.IssueCount, error) {
		return s.svc.store.CountIssuesByState(ctx, s.actor.WorkspaceID)
	})
	if err != nil {
		return 0, err
	}
	var total, completed int64
	for _, c := range counts {
		if !match(c) || c.StateType == "canceled" {
			continue
		}
		total += c.Issues
		if c.StateType == "completed" {
			completed += c.Issues
		}
	}
	if total == 0 {
		return 0, nil
	}
	return float64(completed) / float64(total), nil
}

func (s *Scope) Now() time.Time {
	return s.svc.now()
}

// ProjectStatus is fixed per deployment; its id is its type.
type ProjectStatus struct {
	ID       string
	Name     string
	Type     string
	Color    string
	Position float64
}

var ProjectStatuses = []ProjectStatus{
	{ID: "backlog", Name: "Backlog", Type: "backlog", Color: "#bec2c8", Position: 0},
	{ID: "planned", Name: "Planned", Type: "planned", Color: "#e2e2e2", Position: 1},
	{ID: "started", Name: "In Progress", Type: "started", Color: "#f2c94c", Position: 2},
	{ID: "paused", Name: "Paused", Type: "paused", Color: "#ec7e00", Position: 3},
	{ID: "completed", Name: "Completed", Type: "completed", Color: "#5e6ad2", Position: 4},
	{ID: "canceled", Name: "Canceled", Type: "canceled", Color: "#95a2b3", Position: 5},
}

func projectStatus(id string) ProjectStatus {
	i := slices.IndexFunc(ProjectStatuses, func(st ProjectStatus) bool { return st.ID == id })
	if i < 0 {
		return ProjectStatus{ID: id, Name: id, Type: id}
	}
	return ProjectStatuses[i]
}

func ProjectStatusOf(p storage.Project) ProjectStatus {
	return projectStatus(p.Status)
}

type TeamCreateInput struct {
	Name        string
	Key         *string
	Description *string
	Icon        *string
	Color       *string
}

// DefaultStates is Linear's default workflow for a new team.
var DefaultStates = []storage.NewWorkflowState{
	{Name: "Backlog", Type: "backlog", Color: "#bec2c8", Position: 0},
	{Name: "Todo", Type: "unstarted", Color: "#a9adb5", Position: 1},
	{Name: "In Progress", Type: "started", Color: "#f2c94c", Position: 2},
	{Name: "In Review", Type: "started", Color: "#4cb782", Position: 3},
	{Name: "Done", Type: "completed", Color: "#5e6ad2", Position: 4},
	{Name: "Canceled", Type: "canceled", Color: "#95a2b3", Position: 5},
}

// CreateTeam creates a team with Linear's default workflow.
func (s *Scope) CreateTeam(ctx context.Context, in TeamCreateInput) (storage.Team, error) {
	name, err := checkName(in.Name)
	if err != nil {
		return storage.Team{}, err
	}
	key := strings.ToUpper(strings.TrimSpace(deref(in.Key)))
	if key == "" {
		letters := strings.ToUpper(strings.ReplaceAll(name, " ", ""))
		key = letters[:min(3, len(letters))]
	}
	if !identifierPattern.MatchString(key + "-1") {
		return storage.Team{}, invalid("key must start with a letter and contain only letters and digits")
	}
	team, err := s.svc.store.CreateTeam(ctx, storage.NewTeam{
		WorkspaceID: s.actor.WorkspaceID,
		Key:         key,
		Name:        name,
		Description: in.Description,
		Icon:        in.Icon,
		Color:       in.Color,
	}, DefaultStates)
	if err != nil {
		return team, conflict(err, "a team with key "+key+" already exists")
	}
	s.teams.reset()
	s.states.reset()
	return team, nil
}

type TeamUpdateInput struct {
	Name *string
}

// UpdateTeam renames a team. Its key stays fixed: issue identifiers carry it.
func (s *Scope) UpdateTeam(ctx context.Context, id string, in TeamUpdateInput) (storage.Team, error) {
	team, err := s.Team(ctx, id)
	if err != nil || in.Name == nil {
		return team, err
	}
	if team.Name, err = checkName(*in.Name); err != nil {
		return team, err
	}
	updated, err := s.svc.store.UpdateTeam(ctx, team)
	s.teams.reset()
	return updated, notFound(err, "Team")
}

type OrganizationUpdateInput struct {
	Name *string
}

// UpdateWorkspace changes the actor's workspace; only admins may.
func (s *Scope) UpdateWorkspace(ctx context.Context, in OrganizationUpdateInput) (storage.Workspace, error) {
	viewer, err := s.Viewer(ctx)
	if err != nil {
		return storage.Workspace{}, err
	}
	if !viewer.Admin {
		return storage.Workspace{}, invalid("only workspace admins can update the workspace")
	}
	workspace, err := s.Workspace(ctx)
	if err != nil || in.Name == nil {
		return workspace, err
	}
	if workspace.Name, err = checkName(*in.Name); err != nil {
		return workspace, err
	}
	updated, err := s.svc.store.UpdateWorkspace(ctx, workspace)
	return updated, notFound(err, "Organization")
}

const maxNameLength = 80

// checkName trims a team or workspace name and bounds its length.
func checkName(name string) (string, error) {
	name = strings.TrimSpace(name)
	switch {
	case name == "":
		return "", invalid("name is required")
	case utf8.RuneCountInString(name) > maxNameLength:
		return "", invalid("name must be at most %d characters", maxNameLength)
	}
	return name, nil
}

type WorkflowStateCreateInput struct {
	TeamID      string
	Name        string
	Type        string
	Color       string
	Position    *float64
	Description *string
}

var stateTypes = []string{"triage", "backlog", "unstarted", "started", "completed", "canceled"}

func (s *Scope) CreateWorkflowState(ctx context.Context, in WorkflowStateCreateInput) (storage.WorkflowState, error) {
	team, err := s.Team(ctx, in.TeamID)
	if err != nil {
		return storage.WorkflowState{}, err
	}
	if !slices.Contains(stateTypes, in.Type) {
		return storage.WorkflowState{}, invalid("type must be one of %s", strings.Join(stateTypes, ", "))
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return storage.WorkflowState{}, invalid("name is required")
	}
	position := deref(in.Position)
	if in.Position == nil {
		states, err := s.TeamStates(ctx, team.ID)
		if err != nil {
			return storage.WorkflowState{}, err
		}
		for _, st := range states {
			position = max(position, st.Position+1)
		}
	}
	state, err := s.svc.store.CreateWorkflowState(ctx, storage.NewWorkflowState{
		WorkspaceID: s.actor.WorkspaceID,
		TeamID:      team.ID,
		Name:        name,
		Type:        in.Type,
		Color:       in.Color,
		Position:    position,
		Description: in.Description,
	})
	s.states.reset()
	return state, err
}

type IssueLabelCreateInput struct {
	Name        string
	Color       *string
	Description *string
	TeamID      *string
	ParentID    *string
	IsGroup     *bool
}

func (s *Scope) CreateIssueLabel(ctx context.Context, in IssueLabelCreateInput) (storage.IssueLabel, error) {
	label := storage.NewIssueLabel{
		WorkspaceID: s.actor.WorkspaceID,
		Name:        strings.TrimSpace(in.Name),
		Color:       deref(in.Color),
		Description: in.Description,
		IsGroup:     deref(in.IsGroup),
		ParentID:    in.ParentID,
	}
	if label.Color == "" {
		label.Color = "#bec2c8"
	}
	if in.TeamID != nil {
		team, err := s.Team(ctx, *in.TeamID)
		if err != nil {
			return storage.IssueLabel{}, err
		}
		label.TeamID = &team.ID
	}
	if err := s.checkLabel(ctx, "", label.Name, label.ParentID); err != nil {
		return storage.IssueLabel{}, err
	}
	created, err := s.svc.store.CreateIssueLabel(ctx, label)
	s.labels.reset()
	return created, err
}

type IssueLabelUpdateInput struct {
	Name        *string
	Color       *string
	Description Optional[string]
	ParentID    Optional[string]
}

func (s *Scope) UpdateIssueLabel(ctx context.Context, id string, in IssueLabelUpdateInput) (storage.IssueLabel, error) {
	label, err := s.IssueLabel(ctx, id)
	if err != nil {
		return label, err
	}
	if in.Name != nil {
		label.Name = strings.TrimSpace(*in.Name)
	}
	if in.Color != nil {
		label.Color = *in.Color
	}
	in.Description.apply(&label.Description)
	in.ParentID.apply(&label.ParentID)
	if err := s.checkLabel(ctx, label.ID, label.Name, label.ParentID); err != nil {
		return label, err
	}
	updated, err := s.svc.store.UpdateIssueLabel(ctx, label)
	s.labels.reset()
	return updated, notFound(err, "IssueLabel")
}

func (s *Scope) checkLabel(ctx context.Context, id, name string, parentID *string) error {
	if name == "" {
		return invalid("name is required")
	}
	if parentID == nil {
		return nil
	}
	parent, err := s.IssueLabel(ctx, *parentID)
	if err != nil {
		return err
	}
	if !parent.IsGroup || parent.ID == id {
		return invalid("parent must be a label group")
	}
	return nil
}

func (s *Scope) DeleteIssueLabel(ctx context.Context, id string) error {
	if !isUUID(id) {
		return NotFoundError{Entity: "IssueLabel"}
	}
	err := s.svc.store.DeleteIssueLabel(ctx, s.actor.WorkspaceID, id)
	s.labels.reset()
	return notFound(err, "IssueLabel")
}

type ProjectCreateInput struct {
	Name        string
	Description *string
	Icon        *string
	Color       *string
	StatusID    *string
	LeadID      *string
	TeamIDs     []string
	Priority    *int32
	StartDate   *time.Time
	TargetDate  *time.Time
}

func (s *Scope) CreateProject(ctx context.Context, in ProjectCreateInput) (storage.Project, error) {
	project := storage.Project{
		Name:        strings.TrimSpace(in.Name),
		Description: deref(in.Description),
		Icon:        in.Icon,
		Color:       deref(in.Color),
		Status:      deref(in.StatusID),
		LeadID:      in.LeadID,
		TeamIDs:     in.TeamIDs,
		Priority:    deref(in.Priority),
		StartDate:   in.StartDate,
		TargetDate:  in.TargetDate,
	}
	if project.Status == "" {
		project.Status = "planned"
	}
	if project.Color == "" {
		project.Color = "#5e6ad2"
	}
	if err := s.checkProject(ctx, &project); err != nil {
		return storage.Project{}, err
	}
	created, err := s.svc.store.CreateProject(ctx, storage.NewProject{
		WorkspaceID: s.actor.WorkspaceID,
		Name:        project.Name,
		Description: project.Description,
		Icon:        project.Icon,
		Color:       project.Color,
		Status:      project.Status,
		LeadID:      project.LeadID,
		TeamIDs:     project.TeamIDs,
		Priority:    project.Priority,
		StartDate:   project.StartDate,
		TargetDate:  project.TargetDate,
	})
	s.projects.reset()
	return created, err
}

type ProjectUpdateInput struct {
	Name        *string
	Description *string
	Icon        Optional[string]
	Color       *string
	StatusID    *string
	LeadID      Optional[string]
	TeamIDs     []string
	Priority    *int32
	StartDate   Optional[time.Time]
	TargetDate  Optional[time.Time]
}

func (s *Scope) UpdateProject(ctx context.Context, id string, in ProjectUpdateInput) (storage.Project, error) {
	project, err := s.Project(ctx, id)
	if err != nil {
		return project, err
	}
	if in.Name != nil {
		project.Name = strings.TrimSpace(*in.Name)
	}
	if in.Description != nil {
		project.Description = *in.Description
	}
	if in.Color != nil {
		project.Color = *in.Color
	}
	if in.StatusID != nil {
		project.Status = *in.StatusID
	}
	if in.TeamIDs != nil {
		project.TeamIDs = in.TeamIDs
	}
	if in.Priority != nil {
		project.Priority = *in.Priority
	}
	in.Icon.apply(&project.Icon)
	in.LeadID.apply(&project.LeadID)
	in.StartDate.apply(&project.StartDate)
	in.TargetDate.apply(&project.TargetDate)
	if err := s.checkProject(ctx, &project); err != nil {
		return project, err
	}
	updated, err := s.svc.store.UpdateProject(ctx, project)
	s.projects.reset()
	return updated, notFound(err, "Project")
}

func (s *Scope) checkProject(ctx context.Context, p *storage.Project) error {
	if p.Name == "" {
		return invalid("name is required")
	}
	if !slices.ContainsFunc(ProjectStatuses, func(st ProjectStatus) bool { return st.ID == p.Status }) {
		return invalid("unknown project status %q", p.Status)
	}
	if p.Priority < 0 || p.Priority > 4 {
		return invalid("priority must be between 0 and 4")
	}
	if p.LeadID != nil {
		if _, err := s.User(ctx, *p.LeadID); err != nil {
			return err
		}
	}
	teamIDs := []string{}
	for _, id := range p.TeamIDs {
		team, err := s.Team(ctx, id)
		if err != nil {
			return err
		}
		if !slices.Contains(teamIDs, team.ID) {
			teamIDs = append(teamIDs, team.ID)
		}
	}
	p.TeamIDs = teamIDs
	return nil
}

type CycleCreateInput struct {
	TeamID      string
	Name        *string
	Description *string
	StartsAt    time.Time
	EndsAt      time.Time
}

func (s *Scope) CreateCycle(ctx context.Context, in CycleCreateInput) (storage.Cycle, error) {
	team, err := s.Team(ctx, in.TeamID)
	if err != nil {
		return storage.Cycle{}, err
	}
	if !in.EndsAt.After(in.StartsAt) {
		return storage.Cycle{}, invalid("endsAt must be after startsAt")
	}
	cycle, err := s.svc.store.CreateCycle(ctx, storage.NewCycle{
		WorkspaceID: s.actor.WorkspaceID,
		TeamID:      team.ID,
		Name:        in.Name,
		Description: in.Description,
		StartsAt:    in.StartsAt,
		EndsAt:      in.EndsAt,
	})
	s.cycles.reset()
	return cycle, err
}
