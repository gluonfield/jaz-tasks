package postgres

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	db "github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/generated/tracker"
)

func (s *Store) Issues(ctx context.Context, query storage.IssueQuery) ([]storage.Issue, error) {
	return many(toIssue)(s.q.ListIssues(ctx, db.ListIssuesParams(query)))
}

func (s *Store) Issue(ctx context.Context, workspaceID, id string) (storage.Issue, error) {
	return one(toIssue)(s.q.GetIssue(ctx, db.GetIssueParams{WorkspaceID: workspaceID, ID: id}))
}

func (s *Store) IssueByNumber(ctx context.Context, workspaceID, teamKey string, number int32) (storage.Issue, error) {
	return one(toIssue)(s.q.GetIssueByNumber(ctx, db.GetIssueByNumberParams{WorkspaceID: workspaceID, TeamKey: teamKey, Number: number}))
}

func (s *Store) CreateIssues(ctx context.Context, issues []storage.NewIssue) ([]storage.Issue, error) {
	created := make([]db.Issue, len(issues))
	err := s.tx(ctx, func(q *db.Queries) error {
		for i, issue := range issues {
			var err error
			if created[i], err = q.CreateIssue(ctx, db.CreateIssueParams(issue)); err != nil {
				return err
			}
		}
		return nil
	})
	return many(toIssue)(created, err)
}

func (s *Store) UpdateIssue(ctx context.Context, workspaceID, id string, mutate storage.IssueMutation) (storage.Issue, error) {
	var updated db.Issue
	err := s.tx(ctx, func(q *db.Queries) error {
		locked, err := q.LockIssue(ctx, db.LockIssueParams{WorkspaceID: workspaceID, ID: id})
		if err != nil {
			return err
		}
		read := func(ctx context.Context, id string) (storage.Issue, error) {
			return one(toIssue)(q.LockIssue(ctx, db.LockIssueParams{WorkspaceID: workspaceID, ID: id}))
		}
		next, history, err := mutate(storage.Issue(locked), read)
		if err != nil {
			return err
		}
		if updated, err = q.UpdateIssue(ctx, db.UpdateIssueParams{
			TeamID:      next.TeamID,
			Title:       next.Title,
			Description: next.Description,
			StateID:     next.StateID,
			Priority:    next.Priority,
			Estimate:    next.Estimate,
			AssigneeID:  next.AssigneeID,
			ProjectID:   next.ProjectID,
			CycleID:     next.CycleID,
			ParentID:    next.ParentID,
			LabelIDs:    next.LabelIDs,
			DueDate:     next.DueDate,
			SortOrder:   next.SortOrder,
			StartedAt:   next.StartedAt,
			CompletedAt: next.CompletedAt,
			CanceledAt:  next.CanceledAt,
			ArchivedAt:  next.ArchivedAt,
			ID:          locked.ID,
		}); err != nil {
			return err
		}
		if history == nil {
			return nil
		}
		return q.CreateIssueHistory(ctx, db.CreateIssueHistoryParams(*history))
	})
	return one(toIssue)(updated, err)
}

func (s *Store) DeleteIssue(ctx context.Context, workspaceID, id string) error {
	return affected(s.q.DeleteIssue(ctx, db.DeleteIssueParams{WorkspaceID: workspaceID, ID: id}))
}

func (s *Store) IssueHistory(ctx context.Context, issueID string) ([]storage.IssueHistory, error) {
	return many(toHistory)(s.q.ListIssueHistory(ctx, issueID))
}

func (s *Store) CountIssuesByState(ctx context.Context, workspaceID string) ([]storage.IssueCount, error) {
	return many(toCount)(s.q.CountIssuesByState(ctx, workspaceID))
}

func (s *Store) Comments(ctx context.Context, workspaceID, issueID string) ([]storage.Comment, error) {
	return many(toComment)(s.q.ListComments(ctx, db.ListCommentsParams{WorkspaceID: workspaceID, IssueID: issueID}))
}

func (s *Store) Comment(ctx context.Context, workspaceID, id string) (storage.Comment, error) {
	return one(toComment)(s.q.GetComment(ctx, db.GetCommentParams{WorkspaceID: workspaceID, ID: id}))
}

func (s *Store) CreateComment(ctx context.Context, comment storage.NewComment) (storage.Comment, error) {
	return one(toComment)(s.q.CreateComment(ctx, db.CreateCommentParams(comment)))
}

func (s *Store) UpdateComment(ctx context.Context, c storage.Comment) (storage.Comment, error) {
	return one(toComment)(s.q.UpdateComment(ctx, db.UpdateCommentParams{
		WorkspaceID: c.WorkspaceID,
		ID:          c.ID,
		Body:        c.Body,
		ResolvedAt:  c.ResolvedAt,
		EditedAt:    c.EditedAt,
	}))
}

func (s *Store) DeleteComment(ctx context.Context, workspaceID, id string) error {
	return affected(s.q.DeleteComment(ctx, db.DeleteCommentParams{WorkspaceID: workspaceID, ID: id}))
}
