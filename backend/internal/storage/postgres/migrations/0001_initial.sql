-- +goose Up
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  name text NOT NULL,
  display_name text NOT NULL,
  email text NOT NULL,
  avatar_url text,
  admin boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  label text NOT NULL,
  key_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  issue_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (workspace_id, key)
);

CREATE TABLE workflow_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled')),
  color text NOT NULL,
  position double precision NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE issue_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  team_id uuid REFERENCES teams ON DELETE CASCADE,
  parent_id uuid REFERENCES issue_labels ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  description text,
  is_group boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  slug_id text NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 12),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text,
  color text NOT NULL,
  status text NOT NULL CHECK (status IN ('backlog', 'planned', 'started', 'paused', 'completed', 'canceled')),
  lead_id uuid REFERENCES users ON DELETE SET NULL,
  team_ids uuid[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 0,
  sort_order double precision NOT NULL DEFAULT 0,
  start_date date,
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams ON DELETE CASCADE,
  number integer NOT NULL,
  name text,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (team_id, number)
);

CREATE TABLE issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams ON DELETE CASCADE,
  number integer NOT NULL,
  title text NOT NULL,
  description text,
  state_id uuid NOT NULL REFERENCES workflow_states,
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),
  estimate integer,
  assignee_id uuid REFERENCES users ON DELETE SET NULL,
  creator_id uuid REFERENCES users ON DELETE SET NULL,
  project_id uuid REFERENCES projects ON DELETE SET NULL,
  cycle_id uuid REFERENCES cycles ON DELETE SET NULL,
  parent_id uuid REFERENCES issues ON DELETE SET NULL,
  label_ids uuid[] NOT NULL DEFAULT '{}',
  due_date date,
  sort_order double precision NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (team_id, number)
);

CREATE INDEX issues_workspace_created ON issues (workspace_id, created_at DESC);
CREATE INDEX issues_assignee ON issues (assignee_id);
CREATE INDEX issues_project ON issues (project_id);
CREATE INDEX issues_cycle ON issues (cycle_id);
CREATE INDEX issues_parent ON issues (parent_id);
CREATE INDEX issues_labels ON issues USING gin (label_ids);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES issues ON DELETE CASCADE,
  user_id uuid REFERENCES users ON DELETE SET NULL,
  parent_id uuid REFERENCES comments ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX comments_issue ON comments (issue_id, created_at);

CREATE TABLE issue_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues ON DELETE CASCADE,
  actor_id uuid REFERENCES users ON DELETE SET NULL,
  from_state_id uuid,
  to_state_id uuid,
  from_assignee_id uuid,
  to_assignee_id uuid,
  from_priority integer,
  to_priority integer,
  from_title text,
  to_title text,
  from_team_id uuid,
  to_team_id uuid,
  from_project_id uuid,
  to_project_id uuid,
  from_cycle_id uuid,
  to_cycle_id uuid,
  from_parent_id uuid,
  to_parent_id uuid,
  from_estimate integer,
  to_estimate integer,
  from_due_date date,
  to_due_date date,
  added_label_ids uuid[] NOT NULL DEFAULT '{}',
  removed_label_ids uuid[] NOT NULL DEFAULT '{}',
  updated_description boolean NOT NULL DEFAULT false,
  archived boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX issue_history_issue ON issue_history (issue_id, created_at);
