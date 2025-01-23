-- This migration should be rejected as it's between existing migrations
CREATE TABLE invalid_gap (id SERIAL PRIMARY KEY);
