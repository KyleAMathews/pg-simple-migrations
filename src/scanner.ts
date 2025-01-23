import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { Migration } from './types'
import { logger } from './utils/logger'
import { validateSql } from './utils/sql-validator'

const MIGRATION_FILE_PATTERN = /^(\d+)\s*-\s*(.+?)(?:\s+)?\.sql$/

export interface ScanOptions {
  // List of previously run migrations from the database
  previousMigrations?: Migration[]
  // Maximum allowed gap between consecutive migration numbers
  maxGap?: number
}

export async function scanMigrations(directory: string, options: ScanOptions = {}): Promise<Migration[]> {
  // Read all files in the directory
  const files = await fs.readdir(directory)
  
  // Track ignored files for logging
  const ignoredFiles: { file: string; reason: string }[] = []
  
  // Filter and parse SQL files
  const validFiles = files
    .filter(file => {
      // Skip hidden files
      if (file.startsWith('.')) {
        ignoredFiles.push({
          file,
          reason: 'Hidden files are not allowed'
        })
        return false
      }

      // Only process files that end with exactly .sql
      if (!file.endsWith('.sql') || file.endsWith('.sql.bak')) {
        ignoredFiles.push({
          file,
          reason: 'File must end with .sql extension'
        })
        return false
      }

      const match = file.match(MIGRATION_FILE_PATTERN)
      if (!match) {
        ignoredFiles.push({
          file,
          reason: 'Invalid filename format. Must match pattern: <number>-<name>.sql'
        })
        return false
      }
      
      const [, numberStr] = match
      const number = parseInt(numberStr, 10)
      if (!Number.isSafeInteger(number) || number < 0) {
        ignoredFiles.push({
          file,
          reason: 'Invalid migration number. Must be a positive integer.'
        })
        return false
      }
      
      return true
    })
    // Sort files by migration number
    .sort((a, b) => {
      const aMatch = a.match(MIGRATION_FILE_PATTERN)!
      const bMatch = b.match(MIGRATION_FILE_PATTERN)!
      return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10)
    })

  const migrationPromises = validFiles.map(async file => {
    const match = file.match(MIGRATION_FILE_PATTERN)!
    const [, numberStr, name] = match
    const number = parseInt(numberStr, 10)
    const filePath = path.join(directory, file)
    const sql = await fs.readFile(filePath, 'utf-8')
    
    // Validate SQL syntax
    const sqlError = validateSql(sql, file)
    if (sqlError) {
      throw new Error(
        `Invalid SQL in migration ${file}: ${sqlError.message}` +
        (sqlError.lineNumber ? ` at line ${sqlError.lineNumber}` : '')
      )
    }

    // Calculate SHA-256 hash of file contents
    const hash = crypto
      .createHash('sha256')
      .update(sql)
      .digest('hex')

    return {
      number,
      name: name.trim(), // Trim any whitespace from the name
      path: filePath,
      hash,
      sql
    }
  })

  // Log any ignored files
  if (ignoredFiles.length > 0) {
    logger.warn('Some SQL files were ignored:')
    ignoredFiles.forEach(({ file, reason }) => {
      logger.warn(`  - ${file}: ${reason}`)
    })
  }

  // Wait for all promises
  const migrations = await Promise.all(migrationPromises)

  // Check for duplicate migration numbers
  const numbersSeen = new Map<number, string>()
  for (const migration of migrations) {
    const existingName = numbersSeen.get(migration.number)
    if (existingName) {
      throw new Error(
        `Duplicate migration number: ${String(migration.number).padStart(3, '0')}. ` +
        `Found in files: ${existingName} and ${migration.name}`
      )
    }
    numbersSeen.set(migration.number, migration.name)
  }

  // Sort migrations by number
  const sortedMigrations = migrations.sort((a, b) => a.number - b.number)

  // Get the list of previously run migration numbers
  const previousMigrationNumbers = new Set(options.previousMigrations?.map(m => m.number) ?? [])

  // Find new migrations (not in previousMigrations)
  const newMigrations = sortedMigrations.filter(m => !previousMigrationNumbers.has(m.number))

  // Find the maximum migration number from previous migrations
  const maxPreviousMigration = previousMigrationNumbers.size > 0 
    ? Math.max(...previousMigrationNumbers)
    : 0

  // Check that no new migration is lower than the max previous migration
  for (const migration of newMigrations) {
    if (migration.number <= maxPreviousMigration) {
      throw new Error(
        `Invalid migration number: ${migration.number}. New migrations must be numbered higher than ` +
        `the highest existing migration (${maxPreviousMigration}).`
      )
    }
  }

  // Set default maxGap to 50 if not provided
  const maxGap = options.maxGap ?? 50

  // Check for large gaps between consecutive new migrations
  for (let i = 1; i < newMigrations.length; i++) {
    const gap = newMigrations[i].number - newMigrations[i - 1].number
    if (gap > maxGap) {
      throw new Error(
        `Migration gap too large: ${gap} between migrations ` +
        `${newMigrations[i - 1].number} and ${newMigrations[i].number}. ` +
        `Maximum allowed gap is ${maxGap}.`
      )
    }
  }

  return newMigrations
}
