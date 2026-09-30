-- +goose Up
-- A project's brief: its full markdown document, beside the one-line description.
ALTER TABLE projects ADD COLUMN content text;
