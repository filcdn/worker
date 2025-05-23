import worker from '../bin/worker.js'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { logRetrievalResult } from '../lib/store.js'
import { env } from 'cloudflare:test'
import { applyMigrations } from './setup-db.js'
beforeAll(() => {
  applyMigrations(env)
})
describe('Cloudflare Worker', () => {
  it('forwards request and returns response from fetch', async () => {
    const expected = new Response(null, { status: 200 })

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue(expected)

    const req = new Request('https://example.com/test', { method: 'GET' })
    const result = await worker.fetch(req, {}, {})

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(req)
    expect(result).toBe(expected)
  })
})

describe('logRetrievalResult', () => {
  it('inserts a log into local D1 via logRetrievalResult and verifies it', async () => {
    const HOSTNAME = 'example.com'
    const PIECE_CID = 'QmExamplePieceCid1234'

    const response = new Response(null, {
      status: 200,
      headers: { 'content-length': '1234' }
    })

    await logRetrievalResult(env, {
      hostname: HOSTNAME,
      pieceCid: PIECE_CID,
      response,
      error: null
    })
    console.log(await env.DB.prepare(''))

    const readOutput = await env.DB.prepare(
      `SELECT id,hostname,piece_cid,success,error_reason,egress_bytes FROM retrieval_logs WHERE hostname = '${HOSTNAME}' AND piece_cid = '${PIECE_CID}'`
    ).all()
    const result = readOutput.results
    console.log('Read Output:', result)

    assert.deepStrictEqual(result, [
      {
        id: 1,
        hostname: 'example.com',
        piece_cid: 'QmExamplePieceCid1234',
        success: 1,
        error_reason: null,
        egress_bytes: 1234
      }
    ])
  })
})
