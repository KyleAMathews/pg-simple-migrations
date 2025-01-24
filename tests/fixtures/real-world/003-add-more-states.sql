-- Migration: add-more-states
-- Created at: 2024-11-26T08:26:07.971Z

ALTER TYPE item_state ADD VALUE 'deleted';
ALTER TYPE item_state ADD VALUE 'accepted';
