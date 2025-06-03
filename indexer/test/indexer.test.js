import { describe, it } from 'vitest'
import workerImpl from '../bin/indexer.js'
import { env, ctx } from 'cloudflare:test'

describe('retriever.fetch', () => {
  it.skip('works', () => {
    workerImpl.fetch(new Request('https://example.com/'), env, ctx)
  })
})
