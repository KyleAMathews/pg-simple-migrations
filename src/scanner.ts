import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { Migration } from './types'
import { logger } from './utils/logger'
import { validateSql } from './utils/sql-validator'

const MIGRATION_FILE_PATTERN = /^(\d+)\s*-\s*(.+?)(?:\s+)?\.sql$/

export async function scanMigrations(directory: string): Promise<Migration[]> {
  // Read all files in the directory
  const files = await fs.readdir(directory)
  
  // Track ignored files for logging
  const ignoredFiles: { file: string; reason: string }[] = []
  
  // Filter and parse SQL files
  const migrationPromises = files
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
    .map(async file => {
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
  return migrations.sort((a, b) => a.number - b.number)
}
