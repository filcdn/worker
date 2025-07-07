import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { logRetrievalResult, getOwnerAndValidateClient } from '../lib/store.js'
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

describe('getOwnerAndValidateClient', () => {
  const APPROVED_OWNER_ADDRESS = '0xcb9e86945ca31e6c3120725bf0385cbad684040c'
  it('returns owner for valid rootCid', async () => {
    const setId = 'test-set-1'
    const rootCid = 'test-cid-1'
    const railId = 'test-rail-1'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
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
    await env.DB.prepare(
      'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(setId, railId, clientAddress, APPROVED_OWNER_ADDRESS, true)
      .run()

    const owner = await getOwnerAndValidateClient(env, clientAddress, rootCid)
    assert.strictEqual(owner, APPROVED_OWNER_ADDRESS)
  })

  it('throws error if rootCid not found', async () => {
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
    await assert.rejects(
      async () =>
        await getOwnerAndValidateClient(env, clientAddress, 'nonexistent-cid'),
      /does not exist/,
    )
  })

  it('throws error if set_id exists but has no associated owner', async () => {
    const cid = 'cid-no-owner'
    const setId = 'set-no-owner'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'

    await env.DB.prepare(
      `
      INSERT INTO indexer_roots (root_id, set_id, root_cid)
      VALUES (?, ?, ?)
    `,
    )
      .bind('root-1', setId, cid)
      .run()

    await assert.rejects(
      async () => await getOwnerAndValidateClient(env, clientAddress, cid),
      /no associated owner/,
    )
  })

  it('returns error if no payment rail', async () => {
    const cid = 'cid-unapproved'
    const setId = 'set-unapproved'
    const railId = 'rail-id'
    const owner = APPROVED_OWNER_ADDRESS
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
      ).bind(setId, owner),
      env.DB.prepare(
        'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
      ).bind('root-2', setId, cid),
      env.DB.prepare(
        'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        setId,
        railId,
        clientAddress.replace('a', 'b'),
        APPROVED_OWNER_ADDRESS,
        true,
      ),
    ])

    await assert.rejects(
      async () => await getOwnerAndValidateClient(env, clientAddress, cid),
      /There is no Filecoin Services deal for client/,
    )
  })

  it('returns error if withCDN=false', async () => {
    const cid = 'cid-unapproved'
    const setId = 'set-unapproved'
    const railId = 'rail-id'
    const owner = APPROVED_OWNER_ADDRESS
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
      ).bind(setId, owner),
      env.DB.prepare(
        'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
      ).bind('root-2', setId, cid),
      env.DB.prepare(
        'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(setId, railId, clientAddress, APPROVED_OWNER_ADDRESS, false),
    ])

    await assert.rejects(
      async () => await getOwnerAndValidateClient(env, clientAddress, cid),
      /withCDN=false/,
    )
  })

  it('returns ownerAddress for approved owner', async () => {
    const cid = 'cid-approved'
    const setId = 'set-approved'
    const railId = 'rail'
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
      ).bind(setId, APPROVED_OWNER_ADDRESS),
      env.DB.prepare(
        'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
      ).bind('root-3', setId, cid),
      env.DB.prepare(
        'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(setId, railId, clientAddress, APPROVED_OWNER_ADDRESS, true),
    ])

    const owner = await getOwnerAndValidateClient(env, clientAddress, cid)

    assert.strictEqual(owner, APPROVED_OWNER_ADDRESS)
  })
  it('returns owner for valid rootCid with mixed-case owner (case insensitive)', async () => {
    const setId = 'test-set-1'
    const rootCid = 'test-cid-1'
    const railId = 'test-rail-1'
    const mixedCaseOwner = '0x2A06D234246eD18b6C91de8349fF34C22C7268e8'
    const expectedOwner = mixedCaseOwner.toLowerCase()
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'

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
    await env.DB.prepare(
      'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(setId, railId, clientAddress, mixedCaseOwner, true)
      .run()

    // Lookup by rootCid and assert returned owner is normalized to lowercase
    const owner = await getOwnerAndValidateClient(env, clientAddress, rootCid)
    assert.strictEqual(owner, expectedOwner)
  })
  it('returns the owner first in the ordering when multiple owners share the same rootCid', async () => {
    const setId1 = 'set-a'
    const setId2 = 'set-b'
    const rootCid = 'shared-root-cid'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
    const owner1 = '0x2A06D234246eD18b6C91de8349fF34C22C7268e7'
    const owner2 = '0x2A06D234246eD18b6C91de8349fF34C22C7268e9'

    // Insert both owners into separate sets with the same rootCid
    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(setId1, owner1)
      .run()

    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(setId2, owner2)
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
    // Insert same payment rail for both sets
    await env.DB.prepare(
      'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(setId2, 'rail-b', clientAddress, owner1, true)
      .run()
    await env.DB.prepare(
      'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(setId1, 'rail-a', clientAddress, owner2, true)
      .run()

    // Should return only the owner1 which is the first in the ordering
    const owner = await getOwnerAndValidateClient(env, clientAddress, rootCid)
    assert.strictEqual(owner, owner1.toLowerCase())
  })
})
