-- +goose Up
CREATE TABLE inbox_dismissals (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES issues ON DELETE CASCADE,
  updated_through timestamptz NOT NULL,
  PRIMARY KEY (user_id, issue_id)
);
