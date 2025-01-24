import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool } from 'pg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { Runner } from '../src/runner'
import { getUniqueSchemaName } from './utils/test-helpers'
import { table } from 'console'

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

  describe('real-world migrations', () => {
    beforeEach(async () => {
      // Use real-world migrations instead of test migrations
      runner = new Runner(path.join(__dirname, 'fixtures/real-world'), pool, {
        schema,
        migrationTableSchema: schema,
      })
    })

    it('should execute complex schema migrations', async () => {
      await runner.migrate()

      // Verify enum type was created and modified
      const enumResult = await pool.query(`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'resource_state'
        ORDER BY e.enumsortorder
      `)
      expect(enumResult.rows.map(r => r.enumlabel)).toEqual([
        'initializing',
        'waiting',
        'starting',
        'active',
        'stopping',
        'error',
        'deleted',
        'accepted'
      ])

      // Verify tables were created with correct structure
      const tables = [
        'resources',
        'resource_event_logs',
        'organizations',
        'members',
        'organization_members',
        'organization_resources',
        'audit_logs',
        'resource_setup_forms'
      ]

      for (const table of tables) {
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = $1 
            AND table_name = $2
          )
        `, [schema, table])
        expect(result.rows[0].exists).toBe(true)
      }

      // Verify triggers were created
      const triggerResult = await pool.query(`
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = $1
        AND event_manipulation = 'UPDATE'
      `, [schema])
      const triggerNames = triggerResult.rows.map(r => r.trigger_name)
      expect(triggerNames).toContain('set_timestamp')
      expect(triggerNames).toContain('set_timestamp_organizations')
      expect(triggerNames).toContain('set_timestamp_members')

      // Verify default data was inserted
      const orgResult = await pool.query(`
        SELECT * FROM ${schema}.organizations WHERE name = $1
      `, ['example-org'])
      expect(orgResult.rows).toHaveLength(1)

      const memberResult = await pool.query(`
        SELECT * FROM ${schema}.members WHERE email = $1
      `, ['admin@example.com'])
      expect(memberResult.rows).toHaveLength(1)

      // Verify audit logs were created
      const auditResult = await pool.query(`
        SELECT * FROM ${schema}.audit_logs
      `)
      expect(auditResult.rows.length).toBeGreaterThan(0)
    })

    it('should handle table renames and constraint updates', async () => {
      await runner.migrate()

      // Verify foreign key constraints after table renames
      const fkResult = await pool.query(`
        SELECT
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
        ORDER BY tc.table_name, kcu.column_name
      `, [schema])

      // Verify specific foreign key relationships
      const fks = fkResult.rows
      expect(fks).toContainEqual(expect.objectContaining({
        table_name: 'resource_event_logs',
        column_name: 'resource_id',
        foreign_table_name: 'resources',
        foreign_column_name: 'id'
      }))

      expect(fks).toContainEqual(expect.objectContaining({
        table_name: 'organization_resources',
        column_name: 'resource_id',
        foreign_table_name: 'resources',
        foreign_column_name: 'id'
      }))
    })
  })
})
