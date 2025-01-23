# Architecture

## Overview
`pg-simple-migrations` is a straightforward PostgreSQL migration tool that runs SQL migration files in a specified order. It tracks migration state in the database and ensures migrations run exactly once in the correct sequence.

## Core Components

### 1. Migration Scanner (`src/scanner.ts`)
- Reads the migrations directory
- Validates migration file names (must match pattern: `^\d+-.+\.sql$`)
- Parses migration numbers and sorts them
- Returns a list of valid migration files with their metadata

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
│   ├── scanner.ts
│   ├── state.ts
│   ├── runner.ts
│   ├── cli.ts
│   ├── types.ts
│   └── utils.ts
├── tests/
│   ├── scanner.test.ts
│   ├── state.test.ts
│   ├── runner.test.ts
│   └── integration.test.ts
├── migrations/        # Example migrations for testing
├── tsup.config.ts
├── vitest.config.ts
└── docker-compose.yml # For testing
```

## Testing Strategy
- Unit tests for each core component
- Integration tests using Docker PostgreSQL container
- Test scenarios:
  - Migration file scanning and sorting
  - State table creation and management
  - Successful migration runs
  - Failed migration handling
  - Concurrent migration attempts
  - Invalid migration files
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
- Automatic rollback of failed migrations
- Logging of migration progress and errors

## Security Considerations
- No sensitive data in migration state table
- Uses connection string from environment variable only
- Validates SQL files before execution
- Runs migrations in transactions for atomicity
