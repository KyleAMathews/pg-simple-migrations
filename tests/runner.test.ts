import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool } from 'pg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { Runner } from '../src/runner'
import { getUniqueSchemaName } from './utils/test-helpers'

describe('Runner', () => {
  let pool: Pool
  let runner: Runner
  let testDir: string
  let schema: string

  beforeAll(async () => {
    schema = getUniqueSchemaName()
    
    // Create test directory
    testDir = path.join(os.tmpdir(), 'pg-simple-migrations-test')
    await fs.mkdir(testDir, { recursive: true })

    // Create a new pool for testing
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5433'),
      database: process.env.PGDATABASE || 'test',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
    })
  })

  afterAll(async () => {
    // Clean up test directory and database objects
    await fs.rm(testDir, { recursive: true, force: true })
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await pool.end()
  })

  beforeEach(async () => {
    // Drop test schema and tables
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    
    // Create test schema
    await pool.query(`CREATE SCHEMA ${schema}`)

    // Create test migrations directory
    await fs.rm(testDir, { recursive: true, force: true })
    await fs.mkdir(testDir, { recursive: true })

    // Create test migrations
    await fs.writeFile(
      path.join(testDir, '001-create-users.sql'),
      `CREATE TABLE ${schema}.users (id SERIAL PRIMARY KEY, name TEXT)`
    )
    await fs.writeFile(
      path.join(testDir, '002-add-email.sql'),
      `ALTER TABLE ${schema}.users ADD COLUMN email TEXT`
    )

    // Create runner with test schema
    runner = new Runner(testDir, pool, {
      schema,
      migrationTableSchema: schema,
    })
  })

  describe('migrate', () => {
    it('should run pending migrations in order', async () => {
      await runner.migrate()

      // Verify migrations ran successfully
      const result = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = '${schema}' 
          AND table_name = 'users'
      `)
      expect(result.rows).toHaveLength(1)

      // Verify table structure
      const columns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = '${schema}' 
          AND table_name = 'users'
        ORDER BY ordinal_position
      `)
      expect(columns.rows).toHaveLength(3)
      expect(columns.rows.map(r => r.column_name)).toEqual(['id', 'name', 'email'])
    })

    it('should not run migrations twice', async () => {
      // Running migrations again should be a no-op
      await runner.migrate()
      const status = await runner.status()
      expect(status.every(m => m.hasRun)).toBe(true)
    })
  })

  describe('status', () => {
    it('should return migration status', async () => {
      // Initialize migrations table
      await runner.initialize()
      
      // Run migrations first
      await runner.migrate()
      
      const status = await runner.status()
      expect(status).toHaveLength(2)
      expect(status.every(m => m.hasRun)).toBe(true)
    })
  })
})
