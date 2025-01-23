export interface Migration {
  number: number
  name: string
  path: string
  hash: string
  sql: string
}
