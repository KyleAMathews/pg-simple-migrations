import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import { scanMigrations } from '../src/scanner'
import { logger } from '../src/utils/logger'

describe('scanMigrations', () => {
  const getFixturePath = (name: string) => path.join(__dirname, 'fixtures', name)

  // Spy on logger
  beforeEach(() => {
    vi.spyOn(logger, 'warn')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('basic functionality', () => {
    it('should sort migrations by number', async () => {
      const migrations = await scanMigrations(getFixturePath('valid'))
      expect(migrations.map(m => m.number)).toEqual([1, 2, 10, 20])
    })

    it('should extract migration name', async () => {
      const migrations = await scanMigrations(getFixturePath('valid'))
      expect(migrations[0].name).toBe('create-users')
    })

    it('should throw on invalid migration names', async () => {
      await scanMigrations(getFixturePath('invalid'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Some SQL files were ignored'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('invalid-name.sql'))
    })

    it('should calculate file hash', async () => {
      const migrations = await scanMigrations(getFixturePath('valid'))
      expect(migrations[0].hash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hash
    })
  })

  describe('edge cases', () => {
    it('should handle empty directories', async () => {
      const migrations = await scanMigrations(getFixturePath('empty'))
      expect(migrations).toEqual([])
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should ignore non-SQL files and log warnings', async () => {
      const migrations = await scanMigrations(getFixturePath('mixed'))
      expect(migrations).toHaveLength(1)
      expect(migrations[0].name).toBe('first')
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not-a-migration.sql'))
    })

    it('should throw on duplicate migration numbers', async () => {
      await expect(
        scanMigrations(getFixturePath('duplicates'))
      ).rejects.toThrow('Duplicate migration number: 001')
    })

    it('should throw on non-existent directory', async () => {
      await expect(
        scanMigrations(getFixturePath('non-existent'))
      ).rejects.toThrow(/ENOENT|no such file or directory/)
    })

    it('should handle large migration numbers', async () => {
      // Create a temporary migration file with a large number
      const tempDir = getFixturePath('temp')
      await fs.mkdir(tempDir, { recursive: true })
      const tempFile = path.join(tempDir, '999999999-large-number.sql')
      await fs.writeFile(tempFile, 'SELECT 1;')

      try {
        const migrations = await scanMigrations(tempDir)
        expect(migrations[0].number).toBe(999999999)
        expect(logger.warn).not.toHaveBeenCalled()
      } finally {
        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    })

    it('should handle special characters in migration names', async () => {
      // Create a temporary migration file with special characters
      const tempDir = getFixturePath('temp')
      await fs.mkdir(tempDir, { recursive: true })
      const tempFile = path.join(tempDir, '001-special-#$@-chars.sql')
      await fs.writeFile(tempFile, 'SELECT 1;')

      try {
        const migrations = await scanMigrations(tempDir)
        expect(migrations[0].name).toBe('special-#$@-chars')
        expect(logger.warn).not.toHaveBeenCalled()
      } finally {
        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    })
  })

  describe('advanced edge cases', () => {
    it('should handle leading zeros in migration numbers', async () => {
      const migrations = await scanMigrations(getFixturePath('leading-zeros'))
      expect(migrations.map(m => m.number)).toEqual([1, 2])
      expect(migrations.map(m => m.name)).toEqual(['first', 'second'])
    })

    it('should handle whitespace in filenames', async () => {
      const migrations = await scanMigrations(getFixturePath('whitespace'))
      expect(migrations.map(m => m.name)).toEqual(['spaces', 'trailing-space'])
      expect(migrations).toHaveLength(2)
    })

    it('should handle large files', async () => {
      const migrations = await scanMigrations(getFixturePath('large'))
      expect(migrations).toHaveLength(1)
      expect(migrations[0].sql.length).toBeGreaterThan(5000)
      expect(logger.warn).not.toHaveBeenCalled()
    })

    describe('unicode and special characters', () => {
      it('should handle emoji in filenames', async () => {
        const migrations = await scanMigrations(getFixturePath('unicode'))
        expect(migrations).toHaveLength(2)
        expect(migrations[0].name).toBe('🚀-rocket')
        expect(migrations[1].name).toBe('über-test')
        expect(logger.warn).not.toHaveBeenCalled()
      })
    })

    describe('long filenames', () => {
      it('should handle extremely long filenames', async () => {
        const migrations = await scanMigrations(getFixturePath('long-names'))
        expect(migrations).toHaveLength(1)
        expect(migrations[0].name.length).toBeGreaterThan(100)
        expect(logger.warn).not.toHaveBeenCalled()
      })
    })

    describe('case sensitivity', () => {
      it('should preserve case in filenames', async () => {
        const migrations = await scanMigrations(getFixturePath('case-sensitivity'))
        expect(migrations).toHaveLength(3)
        expect(migrations.map(m => m.name)).toEqual([
          'UPPER-CASE',
          'lower-case',
          'MiXeD-CaSe'
        ])
        expect(logger.warn).not.toHaveBeenCalled()
      })
    })

    describe('hidden files', () => {
      it('should ignore hidden files', async () => {
        const migrations = await scanMigrations(getFixturePath('hidden'))
        expect(migrations).toHaveLength(0)
        expect(logger.warn).toHaveBeenCalled()
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('.001-hidden-file.sql')
        )
      })
    })

    describe('multiple extensions', () => {
      it('should only process .sql files', async () => {
        const migrations = await scanMigrations(getFixturePath('multi-extension'))
        expect(migrations).toHaveLength(1)
        expect(migrations[0].name).toBe('test.backup')
        expect(logger.warn).toHaveBeenCalled()
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('002-test.sql.bak')
        )
      })
    })

    describe('sql validation', () => {
      it('should throw on SQL syntax errors', async () => {
        await expect(scanMigrations(getFixturePath('invalid-sql')))
          .rejects
          .toThrow('Invalid SQL in migration 001-syntax-error.sql')
      })

      it('should throw on incomplete SQL statements', async () => {
        await expect(scanMigrations(getFixturePath('invalid-sql')))
          .rejects
          .toThrow('Invalid SQL in migration')
      })

      it('should validate all SQL files in a directory', async () => {
        // This directory contains valid SQL files
        const migrations = await scanMigrations(getFixturePath('valid'))
        expect(migrations.length).toBeGreaterThan(0)
        expect(logger.warn).not.toHaveBeenCalled()
      })
    })

    describe('migration number validation', () => {
      it('should filter out previously run migrations', async () => {
        // First verify we can scan without previousMigrations
        const migrations = await scanMigrations(getFixturePath('lower-than-max'))
        expect(migrations).toHaveLength(2)
        expect(migrations.map(m => m.number)).toEqual([5, 10])

        // Now try with migration 1 and 10 as previously run
        const previousMigrations = [
          { number: 5, name: 'first', path: '', hash: '', sql: '' },
        ]
        const newMigrations = await scanMigrations(getFixturePath('lower-than-max'), { previousMigrations })
        expect(newMigrations).toHaveLength(1)
        expect(newMigrations[0].number).toBe(10)
      })

      it('should throw error when new migration number is lower than max', async () => {
        // Set up previous migrations with number 10
        const previousMigrations = [
          { number: 10, name: 'third', path: '', hash: '', sql: '' }
        ]

        // Should throw when trying to add migration 5
        await expect(
          scanMigrations(getFixturePath('lower-than-max'), { previousMigrations })
        ).rejects.toThrow('Invalid migration number: 5. New migrations must be numbered higher than the highest existing migration (10).')
      })

      it('should throw error on large gaps between migration numbers', async () => {
        await expect(
          scanMigrations(getFixturePath('large-gap'))
        ).rejects.toThrow('Migration gap too large: 99 between migrations 1 and 100. Maximum allowed gap is 50.')
      })

      it('should allow configurable max gap', async () => {
        // Should pass with maxGap = 100
        const migrations = await scanMigrations(getFixturePath('large-gap'), { maxGap: 100 })
        expect(migrations).toHaveLength(2)
        expect(migrations.map(m => m.number)).toEqual([1, 100])

        // Should fail with maxGap = 20
        await expect(
          scanMigrations(getFixturePath('large-gap'), { maxGap: 20 })
        ).rejects.toThrow('Migration gap too large: 99 between migrations 1 and 100. Maximum allowed gap is 20.')
      })
    })

    describe('complex error cases', () => {
      it('should handle decimal numbers in filenames', async () => {
        await scanMigrations(getFixturePath('complex-errors'))
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('1.2-invalid-number.sql')
        )
      })

      it('should handle negative numbers in filenames', async () => {
        await scanMigrations(getFixturePath('complex-errors'))
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('-1-negative.sql')
        )
      })

      it('should handle missing file extensions', async () => {
        const migrations = await scanMigrations(getFixturePath('complex-errors'))
        expect(migrations).toHaveLength(1) // Only the valid file should be included
        expect(migrations[0].name).toBe('ok')
      })

      it('should handle file permission errors', async () => {
        const tempDir = getFixturePath('temp-permissions')
        await fs.mkdir(tempDir, { recursive: true })
        const tempFile = path.join(tempDir, '001-no-read.sql')
        await fs.writeFile(tempFile, 'SELECT 1;')
        
        try {
          // Make file unreadable if not on Windows
          if (process.platform !== 'win32') {
            await fs.chmod(tempFile, 0o000)
            await expect(scanMigrations(tempDir)).rejects.toThrow(/permission denied/i)
          }
        } finally {
          // Restore permissions to allow cleanup
          if (process.platform !== 'win32') {
            await fs.chmod(tempFile, 0o666)
          }
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })

      it('should handle symlinks', async () => {
        const tempDir = getFixturePath('temp-symlinks')
        const targetDir = getFixturePath('temp-symlinks-target')
        await fs.mkdir(tempDir, { recursive: true })
        await fs.mkdir(targetDir, { recursive: true })
        
        try {
          // Create a valid migration in the target directory
          await fs.writeFile(
            path.join(targetDir, '001-target.sql'),
            'CREATE TABLE test (id INTEGER);'
          )

          // Create a symlink in the temp directory pointing to the target
          if (process.platform !== 'win32') {
            await fs.symlink(
              path.join(targetDir, '001-target.sql'),
              path.join(tempDir, '001-symlink.sql')
            )

            const migrations = await scanMigrations(tempDir)
            expect(migrations).toHaveLength(1)
            expect(migrations[0].name).toBe('symlink')
          }
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
          await fs.rm(targetDir, { recursive: true, force: true })
        }
      })

      it('should handle zero-byte files', async () => {
        const tempDir = getFixturePath('temp-empty')
        await fs.mkdir(tempDir, { recursive: true })
        const tempFile = path.join(tempDir, '001-empty.sql')
        await fs.writeFile(tempFile, '')

        try {
          const migrations = await scanMigrations(tempDir)
          expect(migrations).toHaveLength(1)
          expect(migrations[0].sql).toBe('')
          expect(migrations[0].hash).toMatch(/^[a-f0-9]{64}$/)
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      })
    })
  })
})
