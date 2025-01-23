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
      schema: options.migrationTableSchema,
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

      // Ensure migrations table exists
      await this.initialize()

      // Get migrations from filesystem
      const migrations = await scanMigrations(this.directory, {
        previousMigrations: await this.stateManager.getCompletedMigrations(),
      })

      // Filter out already run migrations
      const pendingMigrations = migrations.filter(m => !m.hasRun)

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations')
        return
      }

      // Run each pending migration
      for (const migration of pendingMigrations) {
        try {
          logger.info(`Running migration ${migration.number}: ${migration.name}`)
          
          // Execute the migration SQL
          await client.query(migration.sql)
          
          // Record successful migration
          await this.stateManager.recordMigration(migration)
          
          logger.info(`Completed migration ${migration.number}`)
        } catch (error) {
          logger.error(`Error running migration ${migration.number}: ${error instanceof Error ? error.message : String(error)}`)
          throw error
        }
      }

      // Commit transaction
      await client.query('COMMIT')
      logger.info(`Successfully ran ${pendingMigrations.length} migrations`)
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK')
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
