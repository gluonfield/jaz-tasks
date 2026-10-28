-- +goose Up
ALTER TABLE saved_views RENAME COLUMN show_completed TO completed_filter;
ALTER TABLE saved_views ALTER COLUMN completed_filter TYPE text USING CASE WHEN completed_filter THEN 'all' ELSE 'hidden' END;
ALTER TABLE saved_views ALTER COLUMN completed_filter SET DEFAULT '7d';
ALTER TABLE saved_views ADD CHECK (completed_filter IN ('hidden', 'week', '7d', '30d', 'all'));
ALTER TABLE saved_views ADD COLUMN due_date_filter text NOT NULL DEFAULT 'any' CHECK (due_date_filter IN ('any', 'week'));
