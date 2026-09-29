package tracker

import (
	"context"
	"strings"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
)

func (s *Scope) Comments(ctx context.Context, issueID string) ([]storage.Comment, error) {
	return s.svc.store.Comments(ctx, s.actor.WorkspaceID, issueID)
}

func (s *Scope) Comment(ctx context.Context, id string) (storage.Comment, error) {
	if !isUUID(id) {
		return storage.Comment{}, NotFoundError{Entity: "Comment"}
	}
	comment, err := s.svc.store.Comment(ctx, s.actor.WorkspaceID, id)
	return comment, notFound(err, "Comment")
}

type CommentCreateInput struct {
	IssueID  *string
	Body     *string
	ParentID *string
}

func (s *Scope) CreateComment(ctx context.Context, in CommentCreateInput) (storage.Comment, error) {
	if in.IssueID == nil {
		return storage.Comment{}, invalid("issueId is required")
	}
	body := strings.TrimSpace(deref(in.Body))
	if body == "" {
		return storage.Comment{}, invalid("body is required")
	}
	issue, err := s.Issue(ctx, *in.IssueID)
	if err != nil {
		return storage.Comment{}, err
	}
	if in.ParentID != nil {
		parent, err := s.Comment(ctx, *in.ParentID)
		if err != nil {
			return storage.Comment{}, err
		}
		if parent.IssueID != issue.ID {
			return storage.Comment{}, invalid("parent comment belongs to another issue")
		}
	}
	return s.svc.store.CreateComment(ctx, storage.NewComment{
		WorkspaceID: s.actor.WorkspaceID,
		IssueID:     issue.ID,
		UserID:      &s.actor.UserID,
		ParentID:    in.ParentID,
		Body:        body,
	})
}

func (s *Scope) UpdateComment(ctx context.Context, id string, body string) (storage.Comment, error) {
	comment, err := s.ownComment(ctx, id)
	if err != nil {
		return comment, err
	}
	if comment.Body = strings.TrimSpace(body); comment.Body == "" {
		return comment, invalid("body is required")
	}
	now := s.svc.now()
	comment.EditedAt = &now
	updated, err := s.svc.store.UpdateComment(ctx, comment)
	return updated, notFound(err, "Comment")
}

func (s *Scope) DeleteComment(ctx context.Context, id string) error {
	comment, err := s.ownComment(ctx, id)
	if err != nil {
		return err
	}
	return notFound(s.svc.store.DeleteComment(ctx, s.actor.WorkspaceID, comment.ID), "Comment")
}

// ownComment loads a comment the actor may edit: their own, or any as an admin.
func (s *Scope) ownComment(ctx context.Context, id string) (storage.Comment, error) {
	comment, err := s.Comment(ctx, id)
	if err != nil {
		return comment, err
	}
	if deref(comment.UserID) == s.actor.UserID {
		return comment, nil
	}
	viewer, err := s.Viewer(ctx)
	if err != nil {
		return comment, err
	}
	if !viewer.Admin {
		return comment, invalid("only the author or an admin can change this comment")
	}
	return comment, nil
}
