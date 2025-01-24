import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { Pool } from 'pg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { Runner } from '../src/runner'
import { StateManager } from '../src/state'
import { getUniqueSchemaName } from './utils/test-helpers'

describe('Concurrency and Error Recovery', () => {
  let pool: Pool
  let testDir: string
  let schema: string

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'pg-simple-migrations-concurrency-test')
    await fs.mkdir(testDir, { recursive: true })

    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5433'),
      database: process.env.PGDATABASE || 'test',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
    })
  })

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
    await pool.end()
  })

  beforeEach(async () => {
    schema = getUniqueSchemaName()
    await pool.query(`CREATE SCHEMA "${schema}"`)
    
    await fs.rm(testDir, { recursive: true, force: true })
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  })

  describe('Concurrent Execution', () => {
    it('should handle multiple instances running migrations simultaneously', async () => {
      // Create multiple runner instances
      const runner1 = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })
      const runner2 = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })

      // Create test migration
      await fs.writeFile(
        path.join(testDir, '001-test.sql'),
        `CREATE TABLE IF NOT EXISTS "${schema}".test (id SERIAL PRIMARY KEY)`
      )

      // Run migrations concurrently
      await Promise.allSettled([
        runner1.migrate(),
        runner2.migrate(),
      ])

      // Verify migration ran exactly once
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM "${schema}".pg_simple_migrations 
        WHERE number = 1
      `)
      expect(result.rows[0].count).toBe('1')

      // Verify table exists
      const tableResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
          AND table_name = 'test'
      `, [schema])
      expect(tableResult.rows).toHaveLength(1)
    })

    it('should handle concurrent schema operations', async () => {
      const concurrentSchema = getUniqueSchemaName('concurrent')
      
      // Create concurrent schema
      await pool.query(`CREATE SCHEMA "${concurrentSchema}"`)
      
      // Create multiple runners with different schemas
      const runner1 = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })
      const runner2 = new Runner(testDir, pool, {
        schema: concurrentSchema,
        migrationTableSchema: concurrentSchema,
      })

      // Create test migrations
      await fs.writeFile(
        path.join(testDir, '001-test1.sql'),
        `CREATE TABLE IF NOT EXISTS "${schema}".test (id SERIAL PRIMARY KEY)`
      )
      await fs.writeFile(
        path.join(testDir, '002-test2.sql'),
        `CREATE TABLE IF NOT EXISTS "${concurrentSchema}".test (id SERIAL PRIMARY KEY)`
      )

      try {
        // Run migrations concurrently
        await Promise.allSettled([
          runner1.migrate(),
          runner2.migrate(),
        ])

        // Verify tables were created in both schemas
        const tables = await pool.query(`
          SELECT table_schema, table_name 
          FROM information_schema.tables 
          WHERE table_schema IN ($1, $2)
            AND table_name = 'test'
          ORDER BY table_schema
        `, [schema, concurrentSchema])

        expect(tables.rows).toHaveLength(2)
      } finally {
        await pool.query(`DROP SCHEMA IF EXISTS "${concurrentSchema}" CASCADE`)
      }
    })
  })

  describe('Error Recovery', () => {
    it('should rollback failed migrations with DDL changes', async () => {
      const runner = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })

      // Create migration that will fail
      await fs.writeFile(
        path.join(testDir, '001-will-fail.sql'),
        `
        CREATE TABLE "${schema}".test1 (id SERIAL PRIMARY KEY);
        CREATE TABLE "${schema}".test2 (
          id SERIAL PRIMARY KEY,
          ref_id INTEGER REFERENCES nonexistent_table(id)
        );
        `
      )

      // Migration should fail and rollback
      await expect(runner.migrate()).rejects.toThrow()

      // Verify no tables were created (rollback successful)
      const tables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
          AND table_name IN ('test1', 'test2')
      `, [schema])

      expect(tables.rows).toHaveLength(0)
    })

    it('should handle partial table creation failure', async () => {
      const runner = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })

      // Create migration with invalid column definition
      await fs.writeFile(
        path.join(testDir, '001-partial-fail.sql'),
        `
        CREATE TABLE "${schema}".test (
          id SERIAL PRIMARY KEY,
          invalid_type INVALID_TYPE
        );
        `
      )

      // Migration should fail
      await expect(runner.migrate()).rejects.toThrow()

      // Verify no tables were created
      const tables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
          AND table_name = 'test'
      `, [schema])

      expect(tables.rows).toHaveLength(0)
    })

    it('should handle syntax errors in the middle of migration', async () => {
      const runner = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })

      // Create migration with syntax error in the middle
      await fs.writeFile(
        path.join(testDir, '001-syntax-error.sql'),
        `
        CREATE TABLE "${schema}".test1 (id SERIAL PRIMARY KEY);
        THIS IS NOT VALID SQL;
        CREATE TABLE "${schema}".test2 (id SERIAL PRIMARY KEY);
        `
      )

      // Migration should fail
      await expect(runner.migrate()).rejects.toThrow(/syntax error/)

      // Verify no tables were created (rollback successful)
      const tables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
          AND table_name IN ('test1', 'test2')
      `, [schema])

      expect(tables.rows).toHaveLength(0)
    })
  })
})
