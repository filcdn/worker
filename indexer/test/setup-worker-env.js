import { env } from 'cloudflare:test'
import { applyMigrations } from '../../db/setup-db.js'

await applyMigrations(env)
