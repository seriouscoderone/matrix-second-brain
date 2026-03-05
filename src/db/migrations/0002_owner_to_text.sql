-- Convert each table's owner column from enum to text
ALTER TABLE areas ALTER COLUMN owner TYPE text;
ALTER TABLE projects ALTER COLUMN owner TYPE text;
ALTER TABLE contacts ALTER COLUMN owner TYPE text;
ALTER TABLE places ALTER COLUMN owner TYPE text;
ALTER TABLE tasks ALTER COLUMN owner TYPE text;
ALTER TABLE waiting_for ALTER COLUMN owner TYPE text;
ALTER TABLE events ALTER COLUMN owner TYPE text;
ALTER TABLE resources ALTER COLUMN owner TYPE text;
ALTER TABLE notes ALTER COLUMN owner TYPE text;
ALTER TABLE shopping_items ALTER COLUMN owner TYPE text;
ALTER TABLE someday_maybe ALTER COLUMN owner TYPE text;
DROP TYPE IF EXISTS owner;
