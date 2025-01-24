import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool } from 'pg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createProgram } from '../src/cli'
import { getUniqueSchemaName } from './utils/test-helpers'

describe('CLI', () => {
  let pool: Pool
  let testDir: string
  let schema: string
  const validFixturesDir = path.join(__dirname, 'fixtures', 'valid')

  beforeAll(async () => {
    schema = getUniqueSchemaName()
    
    // Create test directory
    testDir = path.join(os.tmpdir(), 'pg-simple-migrations-cli-test-' + Math.random().toString(36).substring(7))
    await fs.mkdir(testDir, { recursive: true })

    // Create a new pool for testing
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5433'),
      database: process.env.PGDATABASE || 'test',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
    })

    // Set environment variables
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5433/test'

    // Drop all tables and schema if they exist
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await pool.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `)
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
    console.log('Dropped schema:', schema)
    
    // Create test schema
    await pool.query(`CREATE SCHEMA ${schema}`)
    console.log('Created schema:', schema)

    // Clean and recreate test migrations directory
    await fs.rm(testDir, { recursive: true, force: true })
    await fs.mkdir(testDir, { recursive: true })
    console.log('Created test directory:', testDir)

    // Copy valid fixtures to test directory
    const files = await fs.readdir(validFixturesDir)
    console.log('Valid fixtures:', files)
    for (const file of files) {
      await fs.copyFile(
        path.join(validFixturesDir, file),
        path.join(testDir, file)
      )
    }

    // Check test directory contents
    const testFiles = await fs.readdir(testDir)
    console.log('Test directory:', testDir)
    console.log('Test files:', testFiles)

    // Check schema exists
    const schemas = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = $1
    `, [schema])
    console.log('Schema exists:', schemas.rows.length > 0)
  })

  const runCli = async (command: string, args: string[] = []) => {
    // Capture console output
    const logs: string[] = []
    const originalLog = console.log
    const originalInfo = console.info
    const originalError = console.error
    console.log = (...args) => {
      logs.push(args.join(' '))
      originalLog(...args) // Keep logging to console for debugging
    }
    console.info = (...args) => {
      logs.push(args.join(' '))
      originalInfo(...args) // Keep logging to console for debugging
    }
    console.error = (...args) => {
      logs.push(args.join(' '))
      originalError(...args) // Keep logging to console for debugging
    }

    try {
      const program = createProgram()
      program.exitOverride()
      
      // Run command
      const fullArgs = [
        'node', 'cli.js',
        '--schema', schema,
        '--migrations-dir', testDir,
        command,
        ...args
      ]
      console.log('Running CLI with args:', fullArgs)
      await program.parseAsync(fullArgs)
      
      return { stdout: logs.join('\n') }
    } catch (error) {
      console.error('CLI error:', error)
      if (error.code === 'commander.help' || error.code === 'commander.version') {
        return { stdout: logs.join('\n') }
      }
      if (error.code === 'commander.executeSubCommandAsync.exitOverride') {
        // Process.exit was called, but we want to continue the test
        return { stdout: logs.join('\n') }
      }
      throw error
    } finally {
      console.log = originalLog
      console.info = originalInfo
      console.error = originalError
    }
  }

  const getMigrationState = async () => {
    const result = await pool.query(
      `SELECT number, name FROM "${schema}".pg_simple_migrations ORDER BY number`
    )
    return result.rows
  }

  it('should run all migrations successfully', async () => {
    const { stdout } = await runCli('migrate')
    
    expect(stdout).toContain('Running migration 1: create-users')
    expect(stdout).toContain('Running migration 2: add-user-name')
    expect(stdout).toContain('Running migration 10: add-posts')
    expect(stdout).toContain('Running migration 20: add-post-tags')

    const state = await getMigrationState()
    expect(state).toHaveLength(4)
    expect(state[0]).toMatchObject({ number: 1, name: 'create-users' })
    expect(state[1]).toMatchObject({ number: 2, name: 'add-user-name' })
    expect(state[2]).toMatchObject({ number: 10, name: 'add-posts' })
    expect(state[3]).toMatchObject({ number: 20, name: 'add-post-tags' })

    // Verify tables were actually created
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [schema])

    expect(tables.rows.map(r => r.table_name)).toContain('users')
    expect(tables.rows.map(r => r.table_name)).toContain('posts')
    expect(tables.rows.map(r => r.table_name)).toContain('post_tags')
  })

  it('should show correct status of pending and completed migrations', async () => {
    // Initially all migrations should be pending
    let { stdout } = await runCli('status')
    expect(stdout).toContain('Pending migrations:')
    expect(stdout).toContain('001-create-users.sql')
    expect(stdout).toContain('002-add-user-name.sql')
    expect(stdout).toContain('010-add-posts.sql')
    expect(stdout).toContain('020-add-post-tags.sql')
    expect(stdout).not.toContain('Completed migrations:')

    // Run first migration
    await runCli('migrate')

    // Check status again
    stdout = (await runCli('status')).stdout
    expect(stdout).toContain('Completed migrations:')
    expect(stdout).toContain('001-create-users.sql')
    expect(stdout).toContain('002-add-user-name.sql')
    expect(stdout).toContain('010-add-posts.sql')
    expect(stdout).toContain('020-add-post-tags.sql')
    expect(stdout).not.toContain('Pending migrations:')
  })

  it('should create a new migration file with correct naming', async () => {
    const { stdout } = await runCli('create', ['add-comments'])
    expect(stdout).toContain('Created new migration')
    
    // Check that a new migration file was created
    const files = await fs.readdir(testDir)
    const newFile = files.find(f => f.endsWith('-add-comments.sql'))
    expect(newFile).toBeDefined()
    
    // Check file contents
    const content = await fs.readFile(path.join(testDir, newFile!), 'utf8')
    expect(content).toBe('')
  })
})
