import { Command } from 'commander'
import { Pool } from 'pg'
import path from 'path'
import fs from 'fs/promises'
import { scanMigrations } from './scanner'
import { StateManager } from './state'
import { Runner } from './runner'
import { logger } from './utils/logger'

export const createProgram = () => {
  const program = new Command()

  program
    .option('-d, --migrations-dir <dir>', 'Migrations directory', './migrations')
    .option('-s, --schema <schema>', 'Database schema', 'public')
    .option('--database-url <url>', 'Database URL', process.env.DATABASE_URL)

  const migrateCommand = program
    .command('migrate')
    .description('Run pending migrations')
    .option('--to <number>', 'Run migrations up to this number')
    .action(async (options) => {
      const { migrationsDir, schema, databaseUrl } = program.opts()
      logger.info(`Starting migration with schema: ${schema}, migrations dir: ${migrationsDir}`)
      
      if (!databaseUrl) {
        console.error('Database URL is required. Set DATABASE_URL or pass --database-url')
        process.exit(1)
      }

      const pool = new Pool({ connectionString: databaseUrl })
      logger.info('Connected to database')

      const stateManager = new StateManager(pool, { schema })
      const runner = new Runner(migrationsDir, pool, { 
        schema,
        migrationTableSchema: schema 
      })

      try {
        await runner.migrate()
      } catch (error) {
        console.error('Error running migrations:', error)
        process.exit(1)
      } finally {
        await pool.end()
      }
    })

  const statusCommand = program
    .command('status')
    .description('Show migration status')
    .action(async () => {
      const { migrationsDir, schema, databaseUrl } = program.opts()
      
      if (!databaseUrl) {
        console.error('Database URL is required. Set DATABASE_URL or pass --database-url')
        process.exit(1)
      }

      const pool = new Pool({ connectionString: databaseUrl })
      const stateManager = new StateManager(pool, { schema: schema }) 

      try {
        await stateManager.initialize()
        const migrations = await scanMigrations(migrationsDir)
        const completed = await stateManager.getCompletedMigrations()
        const completedNumbers = new Set(completed.map(m => m.number))
        
        const pending = migrations.filter(m => !completedNumbers.has(m.number))

        if (completed.length > 0) {
          logger.info('\nCompleted migrations:')
          completed.forEach(m => logger.info(`  ${String(m.number).padStart(3, '0')}-${m.name}.sql`))
        }

        if (pending.length > 0) {
          logger.info('\nPending migrations:')
          pending.forEach(m => logger.info(`  ${String(m.number).padStart(3, '0')}-${m.name}.sql`))
        }

        if (completed.length === 0 && pending.length === 0) {
          logger.info('No migrations found')
        }
      } catch (error) {
        console.error('Error getting migration status:', error)
        process.exit(1)
      } finally {
        await pool.end()
      }
    })

  const createCommand = program
    .command('create')
    .description('Create a new migration')
    .argument('<name>', 'Name of the migration')
    .action(async (name) => {
      const { migrationsDir } = program.opts()
      
      try {
        // Ensure migrations directory exists
        await fs.mkdir(migrationsDir, { recursive: true })
        
        // Get list of existing migrations to determine next number
        const files = await fs.readdir(migrationsDir)
        const numbers = files
          .map(f => parseInt(f.split('-')[0]))
          .filter(n => !isNaN(n))
        
        const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
        const paddedNumber = nextNumber.toString().padStart(3, '0')
        const filename = `${paddedNumber}-${name}.sql`
        const filepath = path.join(migrationsDir, filename)
        
        await fs.writeFile(filepath, '')
        logger.info('Created new migration')
        logger.info(filename)
      } catch (error) {
        console.error('Error creating migration:', error)
        process.exit(1)
      }
    })

  return program
}

export const run = (argv: string[] = process.argv) => {
  const program = createProgram()
  return program.parse(argv)
}

// Only run if this file is being run directly
if (require.main === module) {
  run()
}
