package storage

import "time"

// Inputs mirror the sqlc parameter structs for the same reason records do.

// IssueQuery filters issues. A nil ID slice leaves that dimension
// unfiltered; an empty one matches nothing unless the matching Null flag
// admits unset references. Search is a Postgres tsquery over title and
// description; Identifier (e.g. ENG-12) also matches when searching.
type IssueQuery struct {
	WorkspaceID     string
	IncludeArchived bool
	IDs             []string
	TeamIDs         []string
	StateIDs        []string
	Priorities      []int32
	AssigneeIDs     []string
	AssigneeNull    bool
	CreatorIDs      []string
	CreatorNull     bool
	ProjectIDs      []string
	ProjectNull     bool
	CycleIDs        []string
	CycleNull       bool
	ParentIDs       []string
	ParentNull      bool
	LabelIDs        []string
	LabelNull       bool
	Search          string
	Identifier      string
	OrderByUpdated  bool
	Offset          int32
	Limit           int32
}

type NewUser struct {
	WorkspaceID string
	Name        string
	DisplayName string
	Email       string
	AvatarURL   *string
	Admin       bool
	ID          string
}

type NewTeam struct {
	WorkspaceID string
	Key         string
	Name        string
	Description *string
	Icon        *string
	Color       *string
	ID          string
}

type NewWorkflowState struct {
	WorkspaceID string
	TeamID      string
	Name        string
	Type        string
	Color       string
	Position    float64
	Description *string
	ID          string
}

type NewIssueLabel struct {
	WorkspaceID string
	TeamID      *string
	ParentID    *string
	Name        string
	Color       string
	Description *string
	IsGroup     bool
	ID          string
}

type NewProject struct {
	WorkspaceID string
	Name        string
	Description string
	Icon        *string
	Color       string
	Status      string
	LeadID      *string
	TeamIDs     []string
	Priority    int32
	StartDate   *time.Time
	TargetDate  *time.Time
	Content     *string
	ID          string
}

type NewCycle struct {
	WorkspaceID string
	TeamID      string
	Name        *string
	Description *string
	StartsAt    time.Time
	EndsAt      time.Time
	ID          string
}

// NewIssue takes its number from the team counter; a nil SortOrder places the
// issue above every other issue of its team.
type NewIssue struct {
	ID          *string
	WorkspaceID string
	TeamID      string
	Title       string
	Description *string
	StateID     string
	Priority    int32
	Estimate    *int32
	AssigneeID  *string
	CreatorID   *string
	ProjectID   *string
	CycleID     *string
	ParentID    *string
	LabelIDs    []string
	DueDate     *time.Time
	SortOrder   *float64
	StartedAt   *time.Time
	CompletedAt *time.Time
	CanceledAt  *time.Time
}

type NewComment struct {
	WorkspaceID string
	IssueID     string
	UserID      *string
	ParentID    *string
	Body        string
	ID          string
}

type NewIssueHistory struct {
	IssueID            string
	ActorID            *string
	FromStateID        *string
	ToStateID          *string
	FromAssigneeID     *string
	ToAssigneeID       *string
	FromPriority       *int32
	ToPriority         *int32
	FromTitle          *string
	ToTitle            *string
	FromTeamID         *string
	ToTeamID           *string
	FromProjectID      *string
	ToProjectID        *string
	FromCycleID        *string
	ToCycleID          *string
	FromParentID       *string
	ToParentID         *string
	FromEstimate       *int32
	ToEstimate         *int32
	FromDueDate        *time.Time
	ToDueDate          *time.Time
	AddedLabelIDs      []string
	RemovedLabelIDs    []string
	UpdatedDescription bool
	Archived           *bool
	ID                 string
}
