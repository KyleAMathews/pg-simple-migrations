import crypto from 'crypto'

export function getUniqueSchemaName(prefix: string = 'test'): string {
  // Generate a random 6-character suffix
  const suffix = crypto.randomBytes(3).toString('hex')
  return `${prefix}_${suffix}`
}
