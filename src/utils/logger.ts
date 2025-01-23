export const logger = {
  warn: (...args: any[]) => console.warn('\x1b[33m⚠️ ', ...args, '\x1b[0m'),
  error: (...args: any[]) => console.error('\x1b[31m❌', ...args, '\x1b[0m'),
  info: (...args: any[]) => console.info('\x1b[36mℹ️ ', ...args, '\x1b[0m'),
  success: (...args: any[]) => console.log('\x1b[32m✓', ...args, '\x1b[0m'),
}
