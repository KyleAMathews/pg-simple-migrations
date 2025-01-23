import { parse } from 'pgsql-parser'

export interface SqlError {
  message: string
  fileName?: string
  lineNumber?: number
  cursorPosition?: number
}

export function validateSql(sql: string, fileName: string): SqlError | null {
  // Allow empty files
  if (!sql.trim()) {
    return null
  }

  try {
    // Parse the SQL - if it succeeds, the syntax is valid
    parse(sql)
    return null
  } catch (error) {
    // Extract error information
    if (error instanceof Error) {
      return {
        message: 'syntax error',
        fileName,
        // The parser might provide line numbers and positions
        // which we can extract from the error message if needed
        lineNumber: undefined,
        cursorPosition: undefined
      }
    }
    return {
      message: 'Unknown SQL parsing error',
      fileName
    }
  }
}
