import { env } from 'cloudflare:test'
import { applyMigrations } from '../../db/test/setup-db.js'

await applyMigrations(env)
