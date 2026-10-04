package storage

import "time"

type InboxUpdate struct {
	Issue     Issue
	UpdatedAt time.Time
}

type InboxDismissal struct {
	IssueID        string
	UpdatedThrough time.Time
}
