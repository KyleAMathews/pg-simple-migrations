import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool } from 'pg'
import { StateManager } from '../src/state'
import { Migration } from '../src/types'
import { getUniqueSchemaName } from './utils/test-helpers'

describe('StateManager', () => {
  let pool: Pool
  let stateManager: StateManager
  let schema: string

  beforeAll(async () => {
    schema = getUniqueSchemaName()
    
    // Create a new pool for testing
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5433'),
      database: process.env.PGDATABASE || 'test',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
    })

    // Create test schema
    await pool.query(`CREATE SCHEMA ${schema}`)

    // Create state manager with test schema
    stateManager = new StateManager(pool, { schema })
    await stateManager.initialize()
  })

  afterAll(async () => {
    // Clean up test table
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await pool.end()
  })

  beforeEach(async () => {
    // Drop test schema and tables
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    
    // Create test schema
    await pool.query(`CREATE SCHEMA ${schema}`)

    // Create state manager with test schema
    stateManager = new StateManager(pool, { schema })
    await stateManager.initialize()
  })

  const testMigration: Migration = {
    number: 1,
    name: 'test-migration',
    path: '/path/to/migration.sql',
    hash: 'abc123',
    sql: 'CREATE TABLE test (id SERIAL PRIMARY KEY)',
  }

  describe('recordMigration', () => {
    it('should record a new migration', async () => {
      await stateManager.recordMigration(testMigration)
      
      const result = await pool.query(
        `SELECT number, name, hash FROM ${schema}.pg_simple_migrations WHERE number = $1`,
        [testMigration.number]
      )
      
      expect(result.rows[0]).toMatchObject({
        number: testMigration.number,
        name: testMigration.name,
        hash: testMigration.hash,
      })
    })

    it('should prevent concurrent migrations', async () => {
      // Try to record the same migration twice simultaneously
      const promises = [
        stateManager.recordMigration(testMigration),
        stateManager.recordMigration(testMigration),
      ]

      await expect(Promise.all(promises)).rejects.toThrow(
        'Migration 1 was already executed by another process'
      )
    })
  })

  describe('getCompletedMigrations', () => {
    it('should return completed migrations', async () => {
      await stateManager.recordMigration(testMigration)
      
      const completed = await stateManager.getCompletedMigrations()
      expect(completed).toHaveLength(1)
      expect(completed[0]).toMatchObject({
        number: testMigration.number,
        name: testMigration.name,
        hash: testMigration.hash,
        hasRun: true,
      })
    })

    it('should return empty array when no migrations exist', async () => {
      const completed = await stateManager.getCompletedMigrations()
      expect(completed).toHaveLength(0)
    })
  })

  describe('getMigrationStatus', () => {
    it('should mark migrations as run or not run', async () => {
      // Record first migration
      await stateManager.recordMigration(testMigration)

      const secondMigration: Migration = {
        ...testMigration,
        number: 2,
        name: 'second-migration',
      }

      const status = await stateManager.getMigrationStatus([
        testMigration,
        secondMigration,
      ])

      expect(status).toHaveLength(2)
      expect(status[0].hasRun).toBe(true)
      expect(status[1].hasRun).toBe(false)
    })
  })
})
