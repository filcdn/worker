import worker from '../bin/worker.js'
import { describe, it, expect, vi } from 'vitest'

describe('Cloudflare Worker', () => {
  it('forwards request and returns response from fetch', async () => {
    const expected = new Response({ status: 200 })

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue(expected)

    const req = new Request('https://example.com/test', { method: 'GET' })
    const result = await worker.fetch(req, {}, {})

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(req)
    expect(result).toBe(expected)
  })
})
