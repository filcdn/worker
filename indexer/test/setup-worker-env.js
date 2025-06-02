import { env } from 'cloudflare:test'
import { applyMigrations } from '../../retriever/test/setup-db.js'

await applyMigrations(env)
