import { env } from 'cloudflare:test'
import { applyMigrations } from './setup-db.js'

await applyMigrations(env)
