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
    const owner = '0x2A06D234246eD18b6C91de8349fF34C22C7268e8'
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

  it('returns error if set_id exists but has no associated owner', async () => {
    const cid = 'cid-no-owner'
    const setId = 'set-no-owner'

    await env.DB.prepare(
      `
      INSERT INTO indexer_roots (root_id, set_id, root_cid)
      VALUES (?, ?, ?)
    `,
    )
      .bind('root-1', setId, cid)
      .run()

    const result = await getOwnerByRootCid(env, cid)

    assert.ok(
      result.error.includes('no associated owner'),
      'Expected error for set_id without an owner',
    )
  })

  it('returns error if owner exists but is not approved', async () => {
    const cid = 'cid-unapproved'
    const setId = 'set-unapproved'
    const owner = '0x0000000000000000000000000000000000000000' // not in approved list

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
      ).bind(setId, owner),
      env.DB.prepare(
        'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
      ).bind('root-2', setId, cid),
    ])

    const result = await getOwnerByRootCid(env, cid)

    assert.ok(
      result.error.includes('which is not approved'),
      'Expected error for unapproved owner',
    )
  })

  it('returns ownerAddress for approved owner', async () => {
    const cid = 'cid-approved'
    const setId = 'set-approved'
    const owner = '0x2A06D234246eD18b6C91de8349fF34C22C7268e8' // approved

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
      ).bind(setId, owner),
      env.DB.prepare(
        'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
      ).bind('root-3', setId, cid),
    ])

    const result = await getOwnerByRootCid(env, cid)

    assert.deepEqual(result, { ownerAddress: owner })
  })
})
