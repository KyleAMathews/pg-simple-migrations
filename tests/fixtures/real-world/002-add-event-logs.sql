-- Migration: add-event-logs
-- Created at: 2024-11-25T13:27:54.803Z

BEGIN;

CREATE TABLE IF NOT EXISTS item_event_logs (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES items(id),
  instance_id UUID NOT NULL,
  event_name TEXT NOT NULL,
  event_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  emitted_at TIMESTAMPTZ NOT NULL,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON item_event_logs (item_id, emitted_at);
CREATE INDEX ON item_event_logs (instance_id, emitted_at);

COMMIT;
