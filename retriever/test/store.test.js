import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { logRetrievalResult, getOwnerByRootCid } from '../lib/store.js'
import { env } from 'cloudflare:test'
describe('logRetrievalResult', () => {
  it('inserts a log into local D1 via logRetrievalResult and verifies it', async () => {
    const OWNER_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
    const CLIENT_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12'

    await logRetrievalResult(env, {
      ownerAddress: OWNER_ADDRESS,
      clientAddress: CLIENT_ADDRESS,
      cacheMiss: false,
      egressBytes: 1234,
      responseStatus: 200,
      timestamp: new Date().toISOString(),
      requestCountryCode: 'US',
    })

    const readOutput = await env.DB.prepare(
      `SELECT owner_address,client_address,response_status,egress_bytes,cache_miss,request_country_code FROM retrieval_logs WHERE owner_address = '${OWNER_ADDRESS}' AND client_address = '${CLIENT_ADDRESS}'`,
    ).all()
    const result = readOutput.results
    assert.deepStrictEqual(result, [
      {
        owner_address: OWNER_ADDRESS,
        client_address: CLIENT_ADDRESS,
        response_status: 200,
        egress_bytes: 1234,
        cache_miss: 0,
        request_country_code: 'US',
      },
    ])
  })
})

describe('getOwnerByRootCid', () => {
  it('returns owner for valid rootCid', async () => {
    const setId = 'test-set-1'
    const rootCid = 'test-cid-1'
    const owner = '0xTestOwner1'
    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(setId, owner)
      .run()
    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
    )
      .bind('root-1', setId, rootCid)
      .run()

    const result = await getOwnerByRootCid(env, rootCid)
    assert.deepEqual(result, { ownerAddress: owner })
  })

  it('returns error if rootCid not found', async () => {
    const result = await getOwnerByRootCid(env, 'nonexistent-cid')
    assert.ok(
      result.error.includes('does not exist'),
      'Expected an error for missing root_cid',
    )
  })

  it('returns error if set_id has no matching owner', async () => {
    const orphanCid = 'test-cid-orphan'
    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
    )
      .bind('root-orphan', 'nonexistent-set', orphanCid)
      .run()

    const result = await getOwnerByRootCid(env, orphanCid)
    assert.ok(
      result.error.includes('is not associated with any owner'),
      'Expected error for missing owner mapping',
    )
  })
})
