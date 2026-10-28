package postgres_test

import (
	"context"
	"strings"
	"testing"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/lithammer/shortuuid/v4"
)

func TestSavedViewMutationsAreAtomic(t *testing.T) {
	store := postgrestest.New(t)
	ctx := context.Background()
	workspace, err := store.CreateWorkspace(ctx, "Views", "views")
	if err != nil {
		t.Fatal(err)
	}
	view, err := store.CreateSavedView(ctx, storage.SavedView{
		ID: shortuuid.New(), WorkspaceID: workspace.ID, Name: "Shared", LabelIDs: []string{},
		Layout: "board", Grouping: "label", Ordering: "manual", CompletedFilter: "7d", DueDateFilter: "any",
	})
	if err != nil {
		t.Fatal(err)
	}
	const writers = 16
	start := make(chan struct{})
	results := make(chan error, writers)
	for range writers {
		go func() {
			<-start
			_, err := store.UpdateSavedView(ctx, workspace.ID, view.ID, func(current storage.SavedView) (storage.SavedView, error) {
				current.Name += "!"
				return current, nil
			})
			results <- err
		}()
	}
	close(start)
	for range writers {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	views, err := store.SavedViews(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 || views[0].Name != "Shared"+strings.Repeat("!", writers) {
		t.Fatalf("concurrent mutations lost edits: %+v", views)
	}
}
