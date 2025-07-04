import path from 'node:path'
import {
  defineWorkersProject,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersProject(async () => {
  // Read all migrations in the `migrations` directory
  const migrationsPath = path.join(__dirname, '../db/migrations')
  const migrations = await readD1Migrations(migrationsPath)
  return {
    test: {
      setupFiles: ['./test/apply-migrations.js'],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: {
            configPath: './wrangler.toml',
            environment: 'dev',
          },
          miniflare: {
            // Add a test-only binding for migrations, so we can apply them in a
            // setup file
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  }
})
