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
    const OWNER_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
    const CLIENT_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12'

    const response = new Response(null, {
      status: 200,
      headers: { 'content-length': '1234' }
    })

    await logRetrievalResult(env, {
      response,
      ownerAddress: OWNER_ADDRESS,
      clientAddress: CLIENT_ADDRESS,
      cacheMiss: false,
      timestamp: new Date().toISOString()
    })
    console.log(await env.DB.prepare(''))

    const readOutput = await env.DB.prepare(
        `SELECT owner_address,client_address,response_status,egress_bytes,cache_miss FROM retrieval_logs WHERE owner_address = '${OWNER_ADDRESS}' AND client_address = '${CLIENT_ADDRESS}'`
    ).all()
    const result = readOutput.results
    console.log('Read Output:', result)

    assert.deepStrictEqual(result, [
      {
        owner_address: OWNER_ADDRESS,
        client_address: CLIENT_ADDRESS,
        response_status: 200,
        egress_bytes: 1234,
        cache_miss: 0
      }
    ])
  })
})
