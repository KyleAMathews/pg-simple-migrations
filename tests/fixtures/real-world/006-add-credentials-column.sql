-- Migration: add-credentials-column
-- Created at: 2025-01-16T15:22:22.241Z

BEGIN;

-- Adds JSONB column with a map of encrypted credentials, i.e.
-- {
--   "v1.20250116": "v1.20250116~{encrypted data with schema v1 and key 20250116}",
--   "v1.20250226": "v1.20250226~{encrypted data with schema v1 and key 20250226}",
--   "v2.20250507": "v2.20250507~{encrypted data with schema v2 and key 20250507}",
-- }
ALTER TABLE items ADD COLUMN encrypted_credentials JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
