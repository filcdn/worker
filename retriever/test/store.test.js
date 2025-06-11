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
  const APPROVED_OWNER_ADDRESS = '0xcb9e86945ca31e6c3120725bf0385cbad684040c'
  it('returns owner for valid rootCid', async () => {
    const setId = 'test-set-1'
    const rootCid = 'test-cid-1'
    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(setId, APPROVED_OWNER_ADDRESS)
      .run()
    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
    )
      .bind('root-1', setId, rootCid)
      .run()

    const result = await getOwnerByRootCid(env, rootCid)
    assert.deepEqual(result, { ownerAddress: APPROVED_OWNER_ADDRESS })
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
      result.error.includes(
        'exists but has no associated owner from the approved list.',
      ),
      `Expected error for unapproved owner, received: ${JSON.stringify(result)}`,
    )
  })

  it('returns ownerAddress for approved owner', async () => {
    const cid = 'cid-approved'
    const setId = 'set-approved'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
      ).bind(setId, APPROVED_OWNER_ADDRESS),
      env.DB.prepare(
        'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
      ).bind('root-3', setId, cid),
    ])

    const result = await getOwnerByRootCid(env, cid)

    assert.deepEqual(result, { ownerAddress: APPROVED_OWNER_ADDRESS })
  })
  it('returns owner for valid rootCid with mixed-case owner (case insensitive)', async () => {
    const setId = 'test-set-1'
    const rootCid = 'test-cid-1'
    const mixedCaseOwner = '0x2A06D234246eD18b6C91de8349fF34C22C7268e8'
    const expectedOwner = mixedCaseOwner.toLowerCase()

    // Insert a proof set with a mixed-case owner
    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(setId, mixedCaseOwner)
      .run()

    // Insert a root CID linked to the proof set
    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
    )
      .bind('root-1', setId, rootCid)
      .run()

    // Lookup by rootCid and assert returned owner is normalized to lowercase
    const result = await getOwnerByRootCid(env, rootCid)
    assert.deepEqual(result, { ownerAddress: expectedOwner })
  })
  it('returns error if owner is not in the allowed list', async () => {
    const setId = 'test-set-2'
    const rootCid = 'test-cid-2'
    const unapprovedOwner = '0xABCdef1234567890aBcDeF1234567890ABcdef12'
    const allowedOwners = [
      APPROVED_OWNER_ADDRESS,
      '0xe9bc394383b67abcebe86fd9843f53d8b4a2e981',
    ]

    // Insert data
    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(setId, unapprovedOwner)
      .run()

    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
    )
      .bind('root-2', setId, rootCid)
      .run()

    // Function should return null since owner is not in allowlist
    const result = await getOwnerByRootCid(env, rootCid, allowedOwners)
    assert.ok(
      result.error ===
        `Root_cid '${rootCid}' exists but has no associated owner from the approved list.`,
      `Expected error for unapproved owner, received: ${JSON.stringify(result)}`,
    )
  })
  it('returns only the approved owner when multiple owners share the same rootCid', async () => {
    const setId1 = 'set-a'
    const setId2 = 'set-b'
    const rootCid = 'shared-root-cid'

    const unapprovedOwner = '0xUnapprovedabcdef1234567890abcdef1234567899'

    const expectedOwner = APPROVED_OWNER_ADDRESS.toLowerCase()
    const allowedOwners = [expectedOwner]

    // Insert both owners into separate sets with the same rootCid
    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(setId1, APPROVED_OWNER_ADDRESS)
      .run()

    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(setId2, unapprovedOwner)
      .run()

    // Insert same rootCid for both sets
    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
    )
      .bind('root-a', setId1, rootCid)
      .run()

    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
    )
      .bind('root-b', setId2, rootCid)
      .run()

    // Should return only the approved owner
    const result = await getOwnerByRootCid(env, rootCid, allowedOwners)
    assert.deepEqual(result, { ownerAddress: expectedOwner })
  })
})
