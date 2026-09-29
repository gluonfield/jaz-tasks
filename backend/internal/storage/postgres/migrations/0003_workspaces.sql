-- +goose Up
-- A person (one OIDC identity) may belong to several workspaces, one user row each.
ALTER TABLE identities DROP CONSTRAINT identities_pkey;
ALTER TABLE identities ADD PRIMARY KEY (issuer, subject, user_id);

CREATE TABLE workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid REFERENCES users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);
