-- +goose Up
-- Preserve existing ID strings while accepting new shortuuid IDs.
ALTER TABLE api_keys DROP CONSTRAINT api_keys_user_id_fkey;
ALTER TABLE comments DROP CONSTRAINT comments_issue_id_fkey;
ALTER TABLE comments DROP CONSTRAINT comments_parent_id_fkey;
ALTER TABLE comments DROP CONSTRAINT comments_user_id_fkey;
ALTER TABLE comments DROP CONSTRAINT comments_workspace_id_fkey;
ALTER TABLE cycles DROP CONSTRAINT cycles_team_id_fkey;
ALTER TABLE cycles DROP CONSTRAINT cycles_workspace_id_fkey;
ALTER TABLE inbox_dismissals DROP CONSTRAINT inbox_dismissals_issue_id_fkey;
ALTER TABLE inbox_dismissals DROP CONSTRAINT inbox_dismissals_user_id_fkey;
ALTER TABLE identities DROP CONSTRAINT identities_user_id_fkey;
ALTER TABLE issue_history DROP CONSTRAINT issue_history_actor_id_fkey;
ALTER TABLE issue_history DROP CONSTRAINT issue_history_issue_id_fkey;
ALTER TABLE issue_labels DROP CONSTRAINT issue_labels_parent_id_fkey;
ALTER TABLE issue_labels DROP CONSTRAINT issue_labels_team_id_fkey;
ALTER TABLE issue_labels DROP CONSTRAINT issue_labels_workspace_id_fkey;
ALTER TABLE issues DROP CONSTRAINT issues_assignee_id_fkey;
ALTER TABLE issues DROP CONSTRAINT issues_creator_id_fkey;
ALTER TABLE issues DROP CONSTRAINT issues_cycle_id_fkey;
ALTER TABLE issues DROP CONSTRAINT issues_parent_id_fkey;
ALTER TABLE issues DROP CONSTRAINT issues_project_id_fkey;
ALTER TABLE issues DROP CONSTRAINT issues_state_id_fkey;
ALTER TABLE issues DROP CONSTRAINT issues_team_id_fkey;
ALTER TABLE issues DROP CONSTRAINT issues_workspace_id_fkey;
ALTER TABLE oauth_codes DROP CONSTRAINT oauth_codes_user_id_fkey;
ALTER TABLE oauth_grants DROP CONSTRAINT oauth_grants_user_id_fkey;
ALTER TABLE oauth_tokens DROP CONSTRAINT oauth_tokens_grant_id_fkey;
ALTER TABLE projects DROP CONSTRAINT projects_lead_id_fkey;
ALTER TABLE projects DROP CONSTRAINT projects_workspace_id_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_user_id_fkey;
ALTER TABLE teams DROP CONSTRAINT teams_workspace_id_fkey;
ALTER TABLE users DROP CONSTRAINT users_workspace_id_fkey;
ALTER TABLE workflow_states DROP CONSTRAINT workflow_states_team_id_fkey;
ALTER TABLE workflow_states DROP CONSTRAINT workflow_states_workspace_id_fkey;
ALTER TABLE workspace_invites DROP CONSTRAINT workspace_invites_invited_by_fkey;
ALTER TABLE workspace_invites DROP CONSTRAINT workspace_invites_workspace_id_fkey;
ALTER TABLE api_keys
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE comments
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text,
  ALTER COLUMN issue_id TYPE text USING issue_id::text,
  ALTER COLUMN user_id TYPE text USING user_id::text,
  ALTER COLUMN parent_id TYPE text USING parent_id::text;
ALTER TABLE cycles
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text,
  ALTER COLUMN team_id TYPE text USING team_id::text;
ALTER TABLE inbox_dismissals
  ALTER COLUMN user_id TYPE text USING user_id::text,
  ALTER COLUMN issue_id TYPE text USING issue_id::text;
ALTER TABLE identities
  ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE issue_history
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN issue_id TYPE text USING issue_id::text,
  ALTER COLUMN actor_id TYPE text USING actor_id::text,
  ALTER COLUMN from_state_id TYPE text USING from_state_id::text,
  ALTER COLUMN to_state_id TYPE text USING to_state_id::text,
  ALTER COLUMN from_assignee_id TYPE text USING from_assignee_id::text,
  ALTER COLUMN to_assignee_id TYPE text USING to_assignee_id::text,
  ALTER COLUMN from_team_id TYPE text USING from_team_id::text,
  ALTER COLUMN to_team_id TYPE text USING to_team_id::text,
  ALTER COLUMN from_project_id TYPE text USING from_project_id::text,
  ALTER COLUMN to_project_id TYPE text USING to_project_id::text,
  ALTER COLUMN from_cycle_id TYPE text USING from_cycle_id::text,
  ALTER COLUMN to_cycle_id TYPE text USING to_cycle_id::text,
  ALTER COLUMN from_parent_id TYPE text USING from_parent_id::text,
  ALTER COLUMN to_parent_id TYPE text USING to_parent_id::text,
  ALTER COLUMN added_label_ids DROP DEFAULT,
  ALTER COLUMN added_label_ids TYPE text[] USING added_label_ids::text[],
  ALTER COLUMN added_label_ids SET DEFAULT '{}'::text[],
  ALTER COLUMN removed_label_ids DROP DEFAULT,
  ALTER COLUMN removed_label_ids TYPE text[] USING removed_label_ids::text[],
  ALTER COLUMN removed_label_ids SET DEFAULT '{}'::text[];
ALTER TABLE issue_labels
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text,
  ALTER COLUMN team_id TYPE text USING team_id::text,
  ALTER COLUMN parent_id TYPE text USING parent_id::text;
ALTER TABLE issues
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text,
  ALTER COLUMN team_id TYPE text USING team_id::text,
  ALTER COLUMN state_id TYPE text USING state_id::text,
  ALTER COLUMN assignee_id TYPE text USING assignee_id::text,
  ALTER COLUMN creator_id TYPE text USING creator_id::text,
  ALTER COLUMN project_id TYPE text USING project_id::text,
  ALTER COLUMN cycle_id TYPE text USING cycle_id::text,
  ALTER COLUMN parent_id TYPE text USING parent_id::text,
  ALTER COLUMN label_ids DROP DEFAULT,
  ALTER COLUMN label_ids TYPE text[] USING label_ids::text[],
  ALTER COLUMN label_ids SET DEFAULT '{}'::text[];
ALTER TABLE oauth_codes
  ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE oauth_grants
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE oauth_tokens
  ALTER COLUMN grant_id TYPE text USING grant_id::text;
ALTER TABLE projects
  ALTER COLUMN slug_id DROP DEFAULT,
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text,
  ALTER COLUMN lead_id TYPE text USING lead_id::text,
  ALTER COLUMN team_ids DROP DEFAULT,
  ALTER COLUMN team_ids TYPE text[] USING team_ids::text[],
  ALTER COLUMN team_ids SET DEFAULT '{}'::text[];
ALTER TABLE sessions
  ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE teams
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text;
ALTER TABLE users
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text;
ALTER TABLE workflow_states
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text,
  ALTER COLUMN team_id TYPE text USING team_id::text;
ALTER TABLE workspace_invites
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN workspace_id TYPE text USING workspace_id::text,
  ALTER COLUMN invited_by TYPE text USING invited_by::text;
ALTER TABLE workspaces
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE comments ADD CONSTRAINT comments_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE comments ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE comments ADD CONSTRAINT comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE cycles ADD CONSTRAINT cycles_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE cycles ADD CONSTRAINT cycles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE identities ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE issue_history ADD CONSTRAINT issue_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE issue_history ADD CONSTRAINT issue_history_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE issue_labels ADD CONSTRAINT issue_labels_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES issue_labels(id) ON DELETE CASCADE;
ALTER TABLE issue_labels ADD CONSTRAINT issue_labels_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE issue_labels ADD CONSTRAINT issue_labels_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE issues ADD CONSTRAINT issues_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES issues(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_state_id_fkey FOREIGN KEY (state_id) REFERENCES workflow_states(id);
ALTER TABLE issues ADD CONSTRAINT issues_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE issues ADD CONSTRAINT issues_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE oauth_codes ADD CONSTRAINT oauth_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE oauth_grants ADD CONSTRAINT oauth_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES oauth_grants(id) ON DELETE CASCADE;
ALTER TABLE projects ADD CONSTRAINT projects_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE projects ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE teams ADD CONSTRAINT teams_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workflow_states ADD CONSTRAINT workflow_states_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE workflow_states ADD CONSTRAINT workflow_states_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workspace_invites ADD CONSTRAINT workspace_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workspace_invites ADD CONSTRAINT workspace_invites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE inbox_dismissals ADD CONSTRAINT inbox_dismissals_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE inbox_dismissals ADD CONSTRAINT inbox_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
