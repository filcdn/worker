import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/setup-worker-env.js'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml', environment: 'dev' },
      },
    },
  },
})
