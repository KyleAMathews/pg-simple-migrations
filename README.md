# pg-simple-migrations

Manage Postgres migrations with a folder of `.sql` files.

## Installation

```bash
npm install pg-simple-migrations
# or
yarn add pg-simple-migrations
# or
pnpm install pg-simple-migrations
```

## Usage

### Configuration

pg-simple-migrations can be configured using command line arguments or environment variables:

```bash
# Environment variables
export DATABASE_URL=postgres://user:password@localhost:5432/dbname
```

### Creating Migrations

Create a new migration file:

```bash
pg-simple-migrations create add-users-table
# Creates: migrations/001-add-users-table.sql
```

Migration files are automatically numbered sequentially and should contain your SQL commands:

```sql
-- migrations/001-add-users-table.sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Running Migrations

Run all pending migrations:

```bash
pg-simple-migrations migrate --schema public
```

The `--schema` flag is optional and defaults to 'public'. All migrations will run within a transaction.

### Checking Status

View the status of the migrations folder vs. the database:

```bash
pg-simple-migrations status
```

This will show you which migrations have been completed and which would be applied.

## CLI Options

```
Options:
  --schema <schema>        Target schema (default: "public")
  --migrations-dir <dir>   Migrations directory (default: "./migrations")
  -h, --help              Display help
```

## Development

```bash
# Install dependencies
pnpm install

# Start Postgres
docker compose up -d

# Run tests
pnpm test

# Build
pnpm build
```

The tests are configured to work with the Postgres instance started by docker compose.

## How it Works

1. Migrations are stored as SQL files in your migrations directory
2. Each migration runs in its own transaction
3. Migration state is tracked in a `migrations` table in your specified schema
4. Migrations are run in order based on their numeric prefix

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC
