import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { Pool } from 'pg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { Runner } from '../src/runner'
import { StateManager } from '../src/state'
import { getUniqueSchemaName } from './utils/test-helpers'

describe('Edge Cases', () => {
  let pool: Pool
  let testDir: string
  let schema: string

  beforeAll(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), 'pg-simple-migrations-edge-test')
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
    await fs.rm(testDir, { recursive: true, force: true })
    await pool.end()
  })

  beforeEach(async () => {
    // Get a unique schema name for this test
    schema = getUniqueSchemaName()
    
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
    await fs.mkdir(testDir, { recursive: true })
  })

  describe('Schema Edge Cases', () => {
    it('should fail gracefully when schema does not exist', async () => {
      const nonExistentSchema = getUniqueSchemaName('nonexistent')
      const runner = new Runner(testDir, pool, {
        schema: nonExistentSchema,
        migrationTableSchema: nonExistentSchema,
      })

      await fs.writeFile(
        path.join(testDir, '001-test.sql'),
        `CREATE TABLE "${nonExistentSchema}".test (id SERIAL PRIMARY KEY)`
      )

      await expect(runner.migrate()).rejects.toThrow(/schema.*does not exist/)
    })

    it('should properly quote schema names in SQL statements', async () => {
      // Use a schema name that needs quoting but is not a SQL keyword
      const schemaName = 'test_schema_123'
      await pool.query(`CREATE SCHEMA "${schemaName}"`)

      try {
        const runner = new Runner(testDir, pool, {
          schema: schemaName,
          migrationTableSchema: schemaName,
        })

        await fs.writeFile(
          path.join(testDir, '001-test.sql'),
          `CREATE TABLE "${schemaName}".test (id SERIAL PRIMARY KEY)`
        )

        await runner.migrate()

        // Verify table was created
        const result = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = $1 
            AND table_name = 'test'
        `, [schemaName])
        
        expect(result.rows).toHaveLength(1)

        // Verify migrations table was created with proper quoting
        const migrationsTable = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = $1 
            AND table_name = 'pg_simple_migrations'
        `, [schemaName])
        
        expect(migrationsTable.rows).toHaveLength(1)
      } finally {
        await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
      }
    })

    it('should handle schema names with special characters', async () => {
      // Use a schema name that needs quoting but is valid
      const specialSchema = `test_special$123`
      await pool.query(`CREATE SCHEMA "${specialSchema}"`)

      try {
        const runner = new Runner(testDir, pool, {
          schema: specialSchema,
          migrationTableSchema: specialSchema,
        })

        await fs.writeFile(
          path.join(testDir, '001-test.sql'),
          `CREATE TABLE "${specialSchema}".test (id SERIAL PRIMARY KEY)`
        )

        await runner.migrate()

        // Verify table was created
        const result = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = $1 
            AND table_name = 'test'
        `, [specialSchema])
        
        expect(result.rows).toHaveLength(1)
      } finally {
        await pool.query(`DROP SCHEMA IF EXISTS "${specialSchema}" CASCADE`)
      }
    })
  })

  describe('SQL Content Edge Cases', () => {
    beforeEach(async () => {
      await pool.query(`CREATE SCHEMA ${schema}`)
    })

    afterEach(async () => {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    })

    it('should handle multi-statement SQL migrations', async () => {
      const runner = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })

      await fs.writeFile(
        path.join(testDir, '001-multi-statement.sql'),
        `
        CREATE TABLE ${schema}.users (id SERIAL PRIMARY KEY, name TEXT);
        CREATE TABLE ${schema}.posts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES ${schema}.users(id),
          title TEXT
        );
        INSERT INTO ${schema}.users (name) VALUES ('test');
        INSERT INTO ${schema}.posts (user_id, title) VALUES (1, 'Test Post');
        `
      )

      await runner.migrate()

      // Verify both tables exist and have correct data
      const users = await pool.query(`SELECT * FROM ${schema}.users`)
      const posts = await pool.query(`SELECT * FROM ${schema}.posts`)
      
      expect(users.rows).toHaveLength(1)
      expect(posts.rows).toHaveLength(1)
      expect(posts.rows[0].user_id).toBe(users.rows[0].id)
    })

    it('should handle migrations with transaction control statements', async () => {
      const runner = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })

      await fs.writeFile(
        path.join(testDir, '001-transaction-statements.sql'),
        `
        BEGIN;
        CREATE TABLE ${schema}.test1 (id SERIAL PRIMARY KEY);
        SAVEPOINT my_savepoint;
        CREATE TABLE ${schema}.test2 (id SERIAL PRIMARY KEY);
        RELEASE SAVEPOINT my_savepoint;
        COMMIT;
        `
      )

      await runner.migrate()

      // Verify both tables were created
      const tables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
          AND table_name IN ('test1', 'test2')
        ORDER BY table_name
      `, [schema])
      
      expect(tables.rows).toHaveLength(2)
      expect(tables.rows.map(r => r.table_name)).toEqual(['test1', 'test2'])
    })

    it('should handle migrations with Unicode characters', async () => {
      const runner = new Runner(testDir, pool, {
        schema,
        migrationTableSchema: schema,
      })

      await fs.writeFile(
        path.join(testDir, '001-unicode.sql'),
        `
        CREATE TABLE ${schema}.测试表 (
          id SERIAL PRIMARY KEY,
          名称 TEXT,
          描述 TEXT
        );
        INSERT INTO ${schema}.测试表 (名称, 描述) VALUES ('测试', '这是一个测试');
        `
      )

      await runner.migrate()

      // Verify table exists and data was inserted
      const result = await pool.query(`SELECT * FROM ${schema}."测试表"`)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].名称).toBe('测试')
    })
  })
})
