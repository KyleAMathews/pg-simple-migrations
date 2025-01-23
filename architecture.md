# Architecture

## Overview
`pg-simple-migrations` is a straightforward PostgreSQL migration tool that runs SQL migration files in a specified order. It tracks migration state in the database and ensures migrations run exactly once in the correct sequence.

## Core Components

### 1. Migration Scanner (`src/scanner.ts`)
- Reads the migrations directory
- Validates migration file names (must match pattern: `^\d+-.+\.sql$`)
- Parses migration numbers and sorts them
- Returns a list of valid migration files with their metadata
- Enforces migration numbering rules:
  - New migrations must be numbered higher than all previously run migrations
  - Maximum allowed gap between consecutive new migrations (default: 50)
  - Ignores hidden files and non-SQL files
  - Validates SQL syntax before accepting migrations
- Migration validation order:
  1. Filter out invalid files (hidden, non-SQL, malformed names)
  2. Sort remaining migrations by number
  3. Filter out previously run migrations
  4. Check for gaps between consecutive new migrations
  5. Verify new migrations are higher than max previous migration

### 2. Migration State Manager (`src/state.ts`)
- Manages the migrations state table within a specified schema
- Table schema:
  ```sql
  CREATE TABLE IF NOT EXISTS <schema>.pg_simple_migrations (
    number INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    hash TEXT NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  ```
- Creates an index on the `number` column for faster lookups
- Queries for completed migrations
- Records newly completed migrations
- Provides list of previously run migrations to scanner for validation
- Does not manage schema creation (schemas must exist before using the tool)

### 3. Migration Runner (`src/runner.ts`)
- Coordinates between Scanner and StateManager
- Runs migrations in the specified schema
- Handles transaction management:
  - Wraps each migration in a transaction
  - Rolls back on failure
  - Records successful migrations in state table
- Provides detailed error reporting and logging
- Assumes schema exists (does not create schemas)

### 4. CLI Interface (`src/cli.ts`)
- Provides command-line interface
- Handles environment variable loading
- Supports commands:
  - `migrate`: Run pending migrations
  - `status`: Show pending/completed migrations
  - `create`: Create a new migration file with timestamp

## Project Structure
```
pg-simple-migrations/
├── src/
│   ├── scanner.ts      # Migration file discovery and validation
│   ├── state.ts        # Migration state tracking in database
│   ├── runner.ts       # Migration execution logic
│   ├── cli.ts          # Command-line interface
│   ├── types.ts        # TypeScript type definitions
│   └── utils/
│       ├── logger.ts   # Logging utilities
│       └── sql-validator.ts  # SQL syntax validation
├── tests/
│   ├── scanner.test.ts
│   ├── state.test.ts
│   ├── runner.test.ts
│   ├── integration.test.ts
│   └── fixtures/       # Test migration files
│       ├── valid/      # Valid migration scenarios
│       ├── invalid/    # Invalid file names
│       ├── gaps/       # Migration number gaps
│       └── unicode/    # Unicode filename handling
├── migrations/         # Example migrations
├── tsup.config.ts     # Build configuration
├── vitest.config.ts   # Test configuration
└── docker-compose.yml # For testing
```

## Testing Strategy
- Unit tests for each core component
- Integration tests using Docker PostgreSQL container
- Test scenarios:
  - Migration file scanning and sorting
  - Migration number validation rules:
    - Detect and reject gaps larger than allowed maximum
    - Enforce ascending migration numbers
    - Handle previously run migrations
  - State table creation and management
  - Successful migration runs
  - Failed migration handling
  - Concurrent migration attempts
  - Invalid migration files:
    - Hidden files
    - Non-SQL extensions
    - Invalid SQL syntax
    - Invalid number formats
- Test isolation:
  - Uses unique schema names per test to prevent conflicts
  - Properly cleans up schemas between tests
  - Handles concurrent test execution safely

## Security Considerations
- Validates SQL before execution
- Runs migrations in transactions for atomicity
- Validates file names to prevent directory traversal
- Ignores hidden files and non-SQL extensions
- Does not attempt to create schemas (must be pre-existing)
- Uses parameterized queries for all database operations

## Migration File Rules
1. Files must be named: `<number>-<description>.sql`
2. Numbers must be positive integers
3. New migration numbers must be higher than all existing ones
4. Maximum gap between consecutive migrations is configurable
5. Files must have `.sql` extension
6. Files cannot be hidden (no leading `.`)
7. SQL must be valid PostgreSQL syntax
8. SQL must reference schema explicitly (e.g., `CREATE TABLE myschema.table`)

## Schema Management
- The tool does not create or manage schemas
- Schemas must exist before running migrations
- Migration files must explicitly reference schemas in their SQL
- State table is created in a specified schema (defaults to 'public')
- Multiple instances can run concurrently in different schemas
