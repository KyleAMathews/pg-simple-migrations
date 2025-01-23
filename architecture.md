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
- Creates and manages the migrations state table (`_migrations`)
- Table schema:
  ```sql
  CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    migration_number BIGINT NOT NULL,
    name TEXT NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    hash TEXT NOT NULL
  );
  ```
- Queries for completed migrations
- Records newly completed migrations
- Provides list of previously run migrations to scanner for validation

### 3. Migration Runner (`src/runner.ts`)
- Establishes database connection using DATABASE_URL
- Compares available migrations with completed ones
- Runs pending migrations in sequence
- Handles transaction management
- Provides detailed error reporting

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
    - Unicode characters in names
  - Database connection issues

## Build & Package
- TypeScript compilation via tsup
- Generates both ESM and CJS outputs
- Ships with type definitions
- Minimal dependencies:
  - `pg` for PostgreSQL connectivity
  - `dotenv` for environment handling
  - `commander` for CLI interface

## Error Handling
- Detailed error messages for common scenarios:
  - Invalid migration file names
  - SQL syntax errors
  - Database connection issues
  - Concurrent migration attempts
  - Missing environment variables
  - Invalid migration numbers:
    - Numbers lower than highest previous migration
    - Gaps larger than maximum allowed
  - Duplicate migration numbers
- Automatic rollback of failed migrations
- Logging of migration progress and errors
- Clear warning messages for ignored files

## Security Considerations
- No sensitive data in migration state table
- Uses connection string from environment variable only
- Validates SQL files before execution
- Runs migrations in transactions for atomicity
- Validates file names to prevent directory traversal
- Ignores hidden files and non-SQL extensions

## Migration File Rules
1. File Naming:
   - Must match pattern: `<number>-<name>.sql`
   - Number must be a positive integer
   - Name can contain letters, numbers, underscores, dashes
   - File must have .sql extension
   - No hidden files (starting with .)

2. Migration Numbers:
   - Must be higher than all previously run migrations
   - Maximum allowed gap between consecutive new migrations (default: 50)
   - No duplicate numbers allowed
   - Must be valid positive integers

3. SQL Content:
   - Must be valid SQL syntax
   - Validated before migration is accepted
   - Tracked with SHA-256 hash to detect changes
