-- +goose Up
CREATE TABLE saved_views (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name text NOT NULL,
  team_id text REFERENCES teams ON DELETE CASCADE,
  label_ids text[] NOT NULL DEFAULT '{}',
  layout text NOT NULL CHECK (layout IN ('list', 'board')),
  grouping text NOT NULL CHECK (grouping IN ('state', 'label')),
  ordering text NOT NULL CHECK (ordering IN ('manual', 'priority', 'updated', 'created')),
  show_completed boolean NOT NULL,
  show_empty boolean NOT NULL
);
CREATE INDEX saved_views_workspace ON saved_views (workspace_id);
