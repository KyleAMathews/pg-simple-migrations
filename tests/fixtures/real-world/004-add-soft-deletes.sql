-- Migration: add-soft-deletes
-- Created at: 2024-11-26T09:25:20.162Z

BEGIN;

ALTER TABLE items ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE items ALTER COLUMN state SET DEFAULT 'accepted'::item_state;

COMMIT;
