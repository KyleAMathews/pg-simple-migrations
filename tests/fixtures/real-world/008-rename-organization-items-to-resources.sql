-- Rename the organization_items table to organization_resources
ALTER TABLE organization_items RENAME TO organization_resources;

-- Update the foreign key constraint to point to the new resources table
ALTER TABLE organization_resources 
  DROP CONSTRAINT IF EXISTS organization_items_item_id_fkey,
  ADD CONSTRAINT organization_resources_resource_id_fkey 
    FOREIGN KEY (item_id) 
    REFERENCES resources(id);

-- Rename the item_id column to resource_id
ALTER TABLE organization_resources RENAME COLUMN item_id TO resource_id;
