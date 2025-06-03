import { describe, it, expect } from 'vitest'
import workerImpl from '../bin/indexer.js'
import { env } from 'cloudflare:test'

describe('retriever.indexer', () => {
  it('returns 405 for non-POST requests', async () => {
    const req = new Request('https://host/', { method: 'GET' })
    const res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(405)
    expect(await res.text()).toBe('Method Not Allowed')
  })
})
