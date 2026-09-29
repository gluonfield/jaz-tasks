package gql

import (
	"context"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
)

func issuePayload(issue storage.Issue, err error) (*IssuePayload, error) {
	if err != nil {
		return nil, err
	}
	return &IssuePayload{Issue: &issue, Success: true}, nil
}

func archivePayload(issue storage.Issue, err error) (*IssueArchivePayload, error) {
	if err != nil {
		return nil, err
	}
	return &IssueArchivePayload{Entity: &issue, Success: true}, nil
}

func deletePayload(id string, err error) (*DeletePayload, error) {
	if err != nil {
		return nil, err
	}
	return &DeletePayload{EntityID: id, Success: true}, nil
}

func (mutationResolver) IssueCreate(ctx context.Context, input tracker.IssueCreateInput) (*IssuePayload, error) {
	return issuePayload(scope(ctx).CreateIssue(ctx, input))
}

func (mutationResolver) IssueBatchCreate(ctx context.Context, input IssueBatchCreateInput) (*IssueBatchPayload, error) {
	created, err := scope(ctx).CreateIssues(ctx, input.Issues)
	if err != nil {
		return nil, err
	}
	return &IssueBatchPayload{Issues: created, Success: true}, nil
}

func (mutationResolver) IssueUpdate(ctx context.Context, id string, in IssueUpdateInput) (*IssuePayload, error) {
	return issuePayload(scope(ctx).UpdateIssue(ctx, id, tracker.IssueUpdateInput{
		Title:           in.Title.Value(),
		Description:     omittable(in.Description),
		StateID:         in.StateID.Value(),
		Priority:        omittable(in.Priority),
		Estimate:        omittable(in.Estimate),
		AssigneeID:      omittable(in.AssigneeID),
		ProjectID:       omittable(in.ProjectID),
		CycleID:         omittable(in.CycleID),
		ParentID:        omittable(in.ParentID),
		TeamID:          in.TeamID.Value(),
		LabelIDs:        in.LabelIds.Value(),
		AddedLabelIDs:   in.AddedLabelIds.Value(),
		RemovedLabelIDs: in.RemovedLabelIds.Value(),
		DueDate:         omittable(in.DueDate),
		SortOrder:       in.SortOrder.Value(),
	}))
}

func (mutationResolver) IssueAddLabel(ctx context.Context, id string, labelID string) (*IssuePayload, error) {
	return issuePayload(scope(ctx).AddLabel(ctx, id, labelID))
}

func (mutationResolver) IssueRemoveLabel(ctx context.Context, id string, labelID string) (*IssuePayload, error) {
	return issuePayload(scope(ctx).RemoveLabel(ctx, id, labelID))
}

func (mutationResolver) IssueArchive(ctx context.Context, id string) (*IssueArchivePayload, error) {
	return archivePayload(scope(ctx).ArchiveIssue(ctx, id, true))
}

func (mutationResolver) IssueUnarchive(ctx context.Context, id string) (*IssueArchivePayload, error) {
	return archivePayload(scope(ctx).ArchiveIssue(ctx, id, false))
}

// IssueDelete trashes (archives) like Linear unless permanentlyDelete is set.
func (mutationResolver) IssueDelete(ctx context.Context, id string, permanentlyDelete *bool) (*IssueArchivePayload, error) {
	if flag(permanentlyDelete) {
		return archivePayload(scope(ctx).DeleteIssue(ctx, id))
	}
	return archivePayload(scope(ctx).ArchiveIssue(ctx, id, true))
}

func (mutationResolver) CommentCreate(ctx context.Context, input tracker.CommentCreateInput) (*CommentPayload, error) {
	comment, err := scope(ctx).CreateComment(ctx, input)
	if err != nil {
		return nil, err
	}
	return &CommentPayload{Comment: &comment, Success: true}, nil
}

func (mutationResolver) CommentUpdate(ctx context.Context, id string, input CommentUpdateInput) (*CommentPayload, error) {
	comment, err := scope(ctx).UpdateComment(ctx, id, deref(input.Body.Value()))
	if err != nil {
		return nil, err
	}
	return &CommentPayload{Comment: &comment, Success: true}, nil
}

func (mutationResolver) CommentDelete(ctx context.Context, id string) (*DeletePayload, error) {
	return deletePayload(id, scope(ctx).DeleteComment(ctx, id))
}

func (mutationResolver) TeamCreate(ctx context.Context, input tracker.TeamCreateInput) (*TeamPayload, error) {
	team, err := scope(ctx).CreateTeam(ctx, input)
	if err != nil {
		return nil, err
	}
	return &TeamPayload{Team: &team, Success: true}, nil
}

func (mutationResolver) WorkflowStateCreate(ctx context.Context, input tracker.WorkflowStateCreateInput) (*WorkflowStatePayload, error) {
	state, err := scope(ctx).CreateWorkflowState(ctx, input)
	if err != nil {
		return nil, err
	}
	return &WorkflowStatePayload{WorkflowState: &state, Success: true}, nil
}

func (mutationResolver) IssueLabelCreate(ctx context.Context, input tracker.IssueLabelCreateInput) (*IssueLabelPayload, error) {
	label, err := scope(ctx).CreateIssueLabel(ctx, input)
	if err != nil {
		return nil, err
	}
	return &IssueLabelPayload{IssueLabel: &label, Success: true}, nil
}

func (mutationResolver) IssueLabelUpdate(ctx context.Context, id string, in IssueLabelUpdateInput) (*IssueLabelPayload, error) {
	label, err := scope(ctx).UpdateIssueLabel(ctx, id, tracker.IssueLabelUpdateInput{
		Name:        in.Name.Value(),
		Color:       in.Color.Value(),
		Description: omittable(in.Description),
		ParentID:    omittable(in.ParentID),
	})
	if err != nil {
		return nil, err
	}
	return &IssueLabelPayload{IssueLabel: &label, Success: true}, nil
}

func (mutationResolver) IssueLabelDelete(ctx context.Context, id string) (*DeletePayload, error) {
	return deletePayload(id, scope(ctx).DeleteIssueLabel(ctx, id))
}

func (mutationResolver) ProjectCreate(ctx context.Context, input tracker.ProjectCreateInput) (*ProjectPayload, error) {
	project, err := scope(ctx).CreateProject(ctx, input)
	if err != nil {
		return nil, err
	}
	return &ProjectPayload{Project: &project, Success: true}, nil
}

func (mutationResolver) ProjectUpdate(ctx context.Context, id string, in ProjectUpdateInput) (*ProjectPayload, error) {
	project, err := scope(ctx).UpdateProject(ctx, id, tracker.ProjectUpdateInput{
		Name:        in.Name.Value(),
		Description: in.Description.Value(),
		Icon:        omittable(in.Icon),
		Color:       in.Color.Value(),
		StatusID:    in.StatusID.Value(),
		LeadID:      omittable(in.LeadID),
		TeamIDs:     in.TeamIds.Value(),
		Priority:    in.Priority.Value(),
		StartDate:   omittable(in.StartDate),
		TargetDate:  omittable(in.TargetDate),
	})
	if err != nil {
		return nil, err
	}
	return &ProjectPayload{Project: &project, Success: true}, nil
}

func (mutationResolver) CycleCreate(ctx context.Context, input tracker.CycleCreateInput) (*CyclePayload, error) {
	cycle, err := scope(ctx).CreateCycle(ctx, input)
	if err != nil {
		return nil, err
	}
	return &CyclePayload{Cycle: &cycle, Success: true}, nil
}

func deref[T any](v *T) T {
	var zero T
	if v == nil {
		return zero
	}
	return *v
}
