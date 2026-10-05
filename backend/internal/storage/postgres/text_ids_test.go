package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/gluonfield/jaz-tasks/backend/internal/auth"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres"
	"github.com/gluonfield/jaz-tasks/backend/internal/storage/postgres/postgrestest"
	"github.com/gluonfield/jaz-tasks/backend/internal/tracker"
	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/lithammer/shortuuid/v4"
	"github.com/pressly/goose/v3"
)

func TestTextIDsPreserveExistingRecords(t *testing.T) {
	ctx := t.Context()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		base = postgrestest.DefaultURL
	}
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	name := "jaztasks_upgrade_" + shortuuid.New()
	quoted := pgx.Identifier{name}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP DATABASE "+quoted+" WITH (FORCE)"); err != nil {
			t.Error(err)
		}
		_ = admin.Close(ctx)
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
	if _, err := provider.UpTo(ctx, 5); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
INSERT INTO workspaces(name,url_key) VALUES('Legacy','legacy');
INSERT INTO users(workspace_id,name,display_name,email,admin) SELECT id,'Owner','owner','owner@example.com',true FROM workspaces;
INSERT INTO teams(workspace_id,key,name,issue_count) SELECT id,'OLD','Legacy',1 FROM workspaces;
INSERT INTO workflow_states(workspace_id,team_id,name,type,color,position) SELECT workspace_id,id,'Todo','unstarted','#fff',0 FROM teams;
INSERT INTO issue_labels(workspace_id,team_id,name,color) SELECT workspace_id,id,'Legacy label','#fff' FROM teams;
INSERT INTO projects(workspace_id,name,color,status,lead_id,team_ids) SELECT workspace_id,'Legacy project','#fff','planned',id,ARRAY(SELECT id FROM teams) FROM users;
INSERT INTO cycles(workspace_id,team_id,number,starts_at,ends_at) SELECT workspace_id,id,1,now(),now()+interval '1 week' FROM teams;
INSERT INTO issues(workspace_id,team_id,number,title,state_id,assignee_id,creator_id,project_id,cycle_id,label_ids)
SELECT teams.workspace_id,teams.id,1,'Legacy issue',workflow_states.id,users.id,users.id,projects.id,cycles.id,ARRAY(SELECT id FROM issue_labels)
FROM teams,workflow_states,users,projects,cycles;
INSERT INTO comments(workspace_id,issue_id,user_id,body) SELECT workspace_id,id,creator_id,'Legacy comment' FROM issues;
INSERT INTO issue_history(issue_id,actor_id,from_team_id,to_state_id,added_label_ids) SELECT id,creator_id,team_id,state_id,label_ids FROM issues;
INSERT INTO inbox_dismissals(user_id,issue_id,updated_through) SELECT creator_id,id,updated_at FROM issues;
INSERT INTO sessions(token_hash,user_id,expires_at) SELECT 'legacy'::bytea,id,now()+interval '1 day' FROM users;
`); err != nil {
		t.Fatal(err)
	}
	snapshot := func() string {
		t.Helper()
		var rows []string
		for _, table := range []string{"workspaces", "users", "teams", "workflow_states", "issue_labels", "projects", "cycles", "issues", "comments", "issue_history", "inbox_dismissals", "sessions"} {
			var row string
			if err := db.QueryRowContext(ctx, "SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text FROM "+table+" t").Scan(&row); err != nil {
				t.Fatal(err)
			}
			rows = append(rows, row)
		}
		return strings.Join(rows, "\n")
	}
	before := snapshot()
	store, err := postgres.Open(ctx, dsn.String())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if after := snapshot(); after != before {
		t.Fatalf("migration changed existing records:\nbefore %s\nafter %s", before, after)
	}
	var uuidColumns int
	if err := db.QueryRowContext(ctx, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND udt_name IN ('uuid','_uuid')").Scan(&uuidColumns); err != nil || uuidColumns != 0 {
		t.Fatalf("remaining UUID columns: %d, %v", uuidColumns, err)
	}
	var actor auth.Actor
	if err := db.QueryRowContext(ctx, "SELECT id,workspace_id FROM users").Scan(&actor.UserID, &actor.WorkspaceID); err != nil {
		t.Fatal(err)
	}
	scope := tracker.NewService(store, "http://tasks.test").Scope(actor)
	old, err := scope.Issue(ctx, "OLD-1")
	if err != nil {
		t.Fatal(err)
	}
	title := "New child"
	child, err := scope.CreateIssue(ctx, tracker.IssueCreateInput{TeamID: old.TeamID, Title: &title, ParentID: &old.ID, LabelIDs: old.LabelIDs})
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := shortuuid.DefaultEncoder.Decode(child.ID)
	if err != nil || shortuuid.DefaultEncoder.Encode(decoded) != child.ID {
		t.Fatalf("new issue ID: %q, %v", child.ID, err)
	}
	for _, id := range []string{old.ID, child.ID} {
		if got, err := scope.Issue(ctx, id); err != nil || got.ID != id {
			t.Fatalf("lookup %q: %+v, %v", id, got, err)
		}
	}
	if child.ParentID == nil || *child.ParentID != old.ID || !slices.Equal(child.LabelIDs, old.LabelIDs) {
		t.Fatalf("mixed references: %+v", child)
	}
	body := "New comment on existing issue"
	comment, err := scope.CreateComment(ctx, tracker.CommentCreateInput{IssueID: &old.ID, Body: &body})
	if err != nil {
		t.Fatal(err)
	}
	if got, err := scope.Comment(ctx, comment.ID); err != nil || got.ID != comment.ID {
		t.Fatalf("comment lookup: %+v, %v", got, err)
	}
	suppliedShort := shortuuid.NewWithNamespace("jaz-tasks-client-issued-id")
	for _, id := range []string{"92a1103c-9a16-4e34-92d4-225c6f41a97e", suppliedShort} {
		created, err := scope.CreateIssue(ctx, tracker.IssueCreateInput{ID: &id, TeamID: old.TeamID, Title: &title, ParentID: &child.ID})
		if err != nil || created.ID != id || created.ParentID == nil || *created.ParentID != child.ID {
			t.Fatalf("caller-supplied ID %q: %+v, %v", id, created, err)
		}
		if got, err := scope.Issue(ctx, id); err != nil || got.ID != id {
			t.Fatalf("caller-supplied ID lookup %q: %+v, %v", id, got, err)
		}
	}
	if _, err := scope.Issue(ctx, strings.ToLower(suppliedShort)); !errors.As(err, new(tracker.NotFoundError)) {
		t.Fatalf("ID lookup must be case-sensitive: %v", err)
	}
}
