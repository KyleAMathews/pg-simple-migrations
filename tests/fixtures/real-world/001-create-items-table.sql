CREATE TYPE item_state AS ENUM ('initializing', 'waiting', 'starting', 'active', 'stopping', 'error');

-- Core items table
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY,
  connection_string TEXT NOT NULL,
  service_url TEXT NOT NULL,
  location VARCHAR(255) NOT NULL,
  auth_token TEXT NOT NULL,
  state item_state NOT NULL DEFAULT 'initializing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create a trigger function to automatically update updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER set_timestamp
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();
