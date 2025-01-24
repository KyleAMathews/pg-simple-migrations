import { Pool } from 'pg'
import { Migration } from './types'
import { StateManager } from './state'
import { scanMigrations } from './scanner'
import { logger } from './utils/logger'

export interface RunnerOptions {
  schema?: string
  migrationTableSchema?: string
}

export class Runner {
  private pool: Pool
  private stateManager: StateManager
  private directory: string
  private options: RunnerOptions

  constructor(directory: string, pool: Pool, options: RunnerOptions = {}) {
    this.directory = directory
    this.pool = pool
    this.stateManager = new StateManager(pool, {
      schema: options.schema,
    })
    this.options = options
  }

  async initialize(): Promise<void> {
    await this.stateManager.initialize()
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect()

    try {
      // Start transaction
      await client.query('BEGIN')
      logger.info('Started transaction')

      // Ensure migrations table exists
      await this.initialize()
      logger.info('Initialized migrations table')

      // Get migrations from filesystem
      const migrations = await scanMigrations(this.directory, {
        previousMigrations: await this.stateManager.getCompletedMigrations(),
      })
      logger.info(`Found ${migrations.length} migrations in filesystem`)

      // Get completed migrations
      const completed = await this.stateManager.getCompletedMigrations()
      logger.info(`Found ${completed.length} completed migrations`)
      const completedNumbers = new Set(completed.map(m => m.number))

      // Filter out already run migrations
      const pendingMigrations = migrations.filter(m => !completedNumbers.has(m.number))
      logger.info(`Found ${pendingMigrations.length} pending migrations`)

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations')
        return
      }

      // Run each migration in order
      for (const migration of pendingMigrations) {
        logger.info(`Running migration ${migration.number}: ${migration.name}`)

        // Run the migration with schema prefix
        const schema = this.options.schema || 'public'
        await client.query(`SET search_path TO "${schema}"`)
        await client.query(migration.sql)
        logger.info(`Executed migration SQL`)

        // Record successful migration
        await this.stateManager.recordMigration(migration)
        logger.info(`Recorded migration in state table`)

        logger.info(`✓ Migration ${migration.number} completed`)
      }

      // Log success
      logger.info(`Successfully ran ${pendingMigrations.length} migrations`)

      // Commit transaction
      await client.query('COMMIT')
      logger.info('Committed transaction')
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK')
      logger.error('Rolled back transaction due to error')
      throw error
    } finally {
      client.release()
    }
  }

  async status(): Promise<Migration[]> {
    // Get all migrations and their status
    const migrations = await scanMigrations(this.directory)
    return this.stateManager.getMigrationStatus(migrations)
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
