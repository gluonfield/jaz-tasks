package postgres_test

import (
	"context"
	"database/sql"
	"net/url"
	"os"
	"testing"

	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/jackc/pgx/v5"
	"github.com/lithammer/shortuuid/v4"
	"github.com/pressly/goose/v3"
)

func TestSavedViewDateFilterMigration(t *testing.T) {
	ctx := t.Context()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		base = postgrestest.DefaultURL
	}
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	name := "views_upgrade_" + shortuuid.New()
	quoted := pgx.Identifier{name}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := admin.Exec(context.Background(), "DROP DATABASE "+quoted+" WITH (FORCE)")
		if err != nil {
			t.Error(err)
		}
		_ = admin.Close(context.Background())
	})
	dsn, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	dsn.Path = "/" + name
	db, err := sql.Open("pgx", dsn.String())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, db, os.DirFS("migrations"), goose.WithDisableGlobalRegistry(true))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.UpTo(ctx, 7); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
INSERT INTO workspaces(id,name,url_key) VALUES('workspace','Legacy','legacy');
INSERT INTO saved_views(id,workspace_id,name,layout,grouping,ordering,show_completed,show_empty)
VALUES ('hidden','workspace','Hidden','board','label','manual',false,false),
       ('visible','workspace','Visible','list','state','priority',true,true);
`); err != nil {
		t.Fatal(err)
	}
	store, err := postgres.Open(ctx, dsn.String())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	views, err := store.SavedViews(ctx, "workspace")
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 2 || views[0].CompletedFilter != "hidden" || views[1].CompletedFilter != "all" ||
		views[0].DueDateFilter != "any" || views[1].DueDateFilter != "any" ||
		views[0].ShowEmpty || !views[1].ShowEmpty || views[0].Layout != "board" || views[1].Ordering != "priority" {
		t.Fatalf("legacy views changed during migration: %+v", views)
	}
}
