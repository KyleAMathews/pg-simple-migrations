-- Create a large table with many columns and comments
CREATE TABLE test_large (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'deleted')),
  metadata JSONB DEFAULT '{}' NOT NULL,
  description TEXT DEFAULT 'This is a very long default description that takes up space. We need this to be quite long to test our migration scanner with large files. This description should contain plenty of text to ensure we have a good test case.' NOT NULL,
  settings JSONB DEFAULT '{"theme": "default", "notifications": true, "email_frequency": "daily", "language": "en-US", "timezone": "UTC", "currency": "USD", "date_format": "YYYY-MM-DD", "time_format": "HH:mm:ss", "number_format": "1,234.56", "first_day_of_week": "monday"}' NOT NULL
);

-- Add a bunch of columns to make the file larger
ALTER TABLE test_large
ADD COLUMN field1 TEXT DEFAULT 'This is a very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal.' NOT NULL,
ADD COLUMN field2 TEXT DEFAULT 'This is a very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal.' NOT NULL,
ADD COLUMN field3 TEXT DEFAULT 'This is a very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal.' NOT NULL,
ADD COLUMN field4 TEXT DEFAULT 'This is a very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal.' NOT NULL,
ADD COLUMN field5 TEXT DEFAULT 'This is a very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal.' NOT NULL;

-- Add some indexes to make the file even larger
CREATE INDEX idx_test_large_created_at ON test_large (created_at);
CREATE INDEX idx_test_large_updated_at ON test_large (updated_at);
CREATE INDEX idx_test_large_status ON test_large (status);
CREATE INDEX idx_test_large_metadata ON test_large USING gin (metadata);
CREATE INDEX idx_test_large_settings ON test_large USING gin (settings);

-- Add some comments to make the file larger
COMMENT ON TABLE test_large IS 'This is a test table with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal. This is a test table with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal.';

COMMENT ON COLUMN test_large.id IS 'This is a test column with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal. This is a test column with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal.';

COMMENT ON COLUMN test_large.created_at IS 'This is a test column with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal. This is a test column with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal.';

COMMENT ON COLUMN test_large.updated_at IS 'This is a test column with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal. This is a test column with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal.';

COMMENT ON COLUMN test_large.status IS 'This is a test column with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal. This is a test column with a very long comment. The comment should contain enough text to help make this file larger. We are testing the scanner''s ability to handle large SQL files, so we need to ensure this file is sufficiently large. This comment will be repeated several times to help achieve that goal.';

-- Add some more columns with defaults to make the file even larger
ALTER TABLE test_large
ADD COLUMN field6 TEXT DEFAULT 'This is another very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal. Adding more text to make it even larger and ensure we have enough content.' NOT NULL,
ADD COLUMN field7 TEXT DEFAULT 'This is another very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal. Adding more text to make it even larger and ensure we have enough content.' NOT NULL,
ADD COLUMN field8 TEXT DEFAULT 'This is another very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal. Adding more text to make it even larger and ensure we have enough content.' NOT NULL,
ADD COLUMN field9 TEXT DEFAULT 'This is another very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal. Adding more text to make it even larger and ensure we have enough content.' NOT NULL,
ADD COLUMN field10 TEXT DEFAULT 'This is another very long default value that will be repeated many times to create a large file size. We need to ensure our scanner can handle large SQL files efficiently and correctly. This default text includes various characters and should be long enough to help us reach our size goal. Adding more text to make it even larger and ensure we have enough content.' NOT NULL;
