import { Pool } from 'pg'
import { Migration } from './types'
import { logger } from './utils/logger'

const MIGRATIONS_TABLE = 'pg_simple_migrations'

export interface StateManagerOptions {
  schema?: string
}

export class StateManager {
  private pool: Pool
  private schema: string
  private tableName: string

  constructor(pool: Pool, options: StateManagerOptions = {}) {
    this.pool = pool
    this.schema = options.schema || 'public'
    // Use double quotes to properly escape identifiers
    this.tableName = `"${this.schema}"."${MIGRATIONS_TABLE}"`
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect()
    try {
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          number INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          hash TEXT NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `)

      // Create index if it doesn't exist
      await client.query(`
        CREATE INDEX IF NOT EXISTS "${MIGRATIONS_TABLE}_number_idx"
        ON ${this.tableName} (number);
      `)
    } finally {
      client.release()
    }
  }

  async getCompletedMigrations(): Promise<Migration[]> {
    const result = await this.pool.query<Migration>(`
      SELECT 
        number,
        name,
        hash,
        TRUE as "hasRun"
      FROM ${this.tableName}
      ORDER BY number ASC
    `)
    return result.rows
  }

  async recordMigration(migration: Migration): Promise<void> {
    const client = await this.pool.connect()
    try {
      // Use advisory lock to prevent concurrent migrations
      // The lock key is based on the migration number
      await client.query('SELECT pg_advisory_xact_lock($1)', [migration.number])
      
      // Check if migration was already run by another process
      const existing = await client.query(`
        SELECT number FROM ${this.tableName}
        WHERE number = $1
      `, [migration.number])
      
      if (existing.rowCount > 0) {
        throw new Error(`Migration ${migration.number} was already executed by another process`)
      }

      // Record the migration
      await client.query(`
        INSERT INTO ${this.tableName}
        (number, name, hash)
        VALUES ($1, $2, $3)
      `, [migration.number, migration.name, migration.hash])
    } finally {
      client.release()
    }
  }

  async getMigrationStatus(migrations: Migration[]): Promise<Migration[]> {
    const completed = await this.getCompletedMigrations()
    const completedMap = new Map(completed.map(m => [m.number, m]))

    return migrations.map(migration => ({
      ...migration,
      hasRun: completedMap.has(migration.number)
    }))
  }
}
