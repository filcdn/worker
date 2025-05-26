import { describe, it, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { logRetrievalResult } from '../lib/store.js'
import { env } from 'cloudflare:test'
import { applyMigrations } from './setup-db.js'

beforeAll(() => {
  applyMigrations(env)
})

describe('logRetrievalResult', () => {
  it('inserts a log into local D1 via logRetrievalResult and verifies it', async () => {
    const HOSTNAME = 'example.com'
    const PIECE_CID = 'QmExamplePieceCid1234'

    const response = new Response(null, {
      status: 200,
      headers: { 'Content-Length': '1234' }
    })

    await logRetrievalResult(env, {
      hostname: HOSTNAME,
      pieceCid: PIECE_CID,
      response,
      proofSetId: 1,
      cacheMiss: false
    })
    console.log(await env.DB.prepare(''))

    const readOutput = await env.DB.prepare(
        `SELECT id,hostname,piece_cid,response_status,egress_bytes,cache_miss,proof_set_id FROM retrieval_logs WHERE hostname = '${HOSTNAME}' AND piece_cid = '${PIECE_CID}'`
    ).all()
    const result = readOutput.results
    assert.deepStrictEqual(result, [
      {
        id: 1,
        hostname: 'example.com',
        piece_cid: 'QmExamplePieceCid1234',
        response_status: 200,
        egress_bytes: 1234,
        cache_miss: 0,
        proof_set_id: 1
      }
    ])
  })
})
