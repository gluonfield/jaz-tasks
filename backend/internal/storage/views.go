package storage

type SavedView struct {
	ID              string
	WorkspaceID     string
	Name            string
	TeamID          *string
	LabelIDs        []string
	Layout          string
	Grouping        string
	Ordering        string
	CompletedFilter string
	ShowEmpty       bool
	DueDateFilter   string
}

// SavedViewMutation edits a row locked for the transaction's duration.
type SavedViewMutation func(SavedView) (SavedView, error)
