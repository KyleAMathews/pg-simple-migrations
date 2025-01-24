-- Rename the enum type
ALTER TYPE item_state RENAME TO resource_state;

-- Rename the items table to resources
ALTER TABLE items RENAME TO resources;

-- Update the trigger to point to the new table name
DROP TRIGGER IF EXISTS set_timestamp ON resources;
CREATE TRIGGER set_timestamp
  BEFORE UPDATE ON resources
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Rename item_id columns in related tables
ALTER TABLE item_event_logs RENAME TO resource_event_logs;
ALTER TABLE resource_event_logs RENAME COLUMN item_id TO resource_id;

-- Update any foreign key constraints to use the new table name
ALTER TABLE resource_event_logs 
  DROP CONSTRAINT IF EXISTS item_event_logs_item_id_fkey,
  ADD CONSTRAINT resource_event_logs_resource_id_fkey 
    FOREIGN KEY (resource_id) 
    REFERENCES resources(id);
