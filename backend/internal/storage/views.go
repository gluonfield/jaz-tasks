package storage

type SavedView struct {
	ID            string
	WorkspaceID   string
	Name          string
	TeamID        *string
	LabelIDs      []string
	Layout        string
	Grouping      string
	Ordering      string
	ShowCompleted bool
	ShowEmpty     bool
}
