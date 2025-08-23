import { describe, it, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import {
  logRetrievalResult,
  getStorageProviderAndValidateClient,
  updateDataSetSats,
} from '../lib/store.js'
import { env } from 'cloudflare:test'
import {
  withDataSetPieces,
  withApprovedProvider,
} from './test-data-builders.js'

describe('logRetrievalResult', () => {
  it('inserts a log into local D1 via logRetrievalResult and verifies it', async () => {
    const STORAGE_PROVIDER = '0x1234567890abcdef1234567890abcdef12345678'
    const CLIENT_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12'

    await logRetrievalResult(env, {
      storageProvider: STORAGE_PROVIDER,
      clientAddress: CLIENT_ADDRESS,
      cacheMiss: false,
      egressBytes: 1234,
      responseStatus: 200,
      timestamp: new Date().toISOString(),
      requestCountryCode: 'US',
      dataSetId: '1',
    })

    const readOutput = await env.DB.prepare(
      `SELECT 
        storage_provider,
        client_address,
        response_status,
        egress_bytes,
        cache_miss,
        request_country_code,
        data_set_id 
      FROM retrieval_logs 
      WHERE storage_provider = '${STORAGE_PROVIDER}' AND client_address = '${CLIENT_ADDRESS}'`,
    ).all()
    const result = readOutput.results
    assert.deepStrictEqual(result, [
      {
        storage_provider: STORAGE_PROVIDER,
        client_address: CLIENT_ADDRESS,
        response_status: 200,
        egress_bytes: 1234,
        cache_miss: 0,
        request_country_code: 'US',
        data_set_id: '1',
      },
    ])
  })
})

describe('getStorageProviderAndValidateClient', () => {
  const APPROVED_STORAGE_PROVIDER = '0xcb9e86945ca31e6c3120725bf0385cbad684040c'
  beforeAll(async () => {
    await withApprovedProvider(env, {
      id: 10,
      beneficiary: APPROVED_STORAGE_PROVIDER,
      serviceUrl: 'https://approved-provider.xyz',
    })
  })

  it('returns storage provider for valid pieceCid', async () => {
    const dataSetId = 'test-set-1'
    const pieceCid = 'test-cid-1'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'

    await env.DB.prepare(
      'INSERT INTO data_sets (id, storage_provider, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        dataSetId,
        APPROVED_STORAGE_PROVIDER,
        clientAddress,
        APPROVED_STORAGE_PROVIDER,
        true,
      )
      .run()
    await env.DB.prepare(
      'INSERT INTO pieces (id, data_set_id, cid) VALUES (?, ?, ?)',
    )
      .bind('piece-1', dataSetId, pieceCid)
      .run()

    const result = await getStorageProviderAndValidateClient(
      env,
      clientAddress,
      pieceCid,
    )
    assert.strictEqual(result.storageProvider, APPROVED_STORAGE_PROVIDER)
  })

  it('throws error if pieceCid not found', async () => {
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
    await assert.rejects(
      async () =>
        await getStorageProviderAndValidateClient(
          env,
          clientAddress,
          'nonexistent-cid',
        ),
      /does not exist/,
    )
  })

  it('throws error if data_set_id exists but has no associated owner', async () => {
    const cid = 'cid-no-owner'
    const dataSetId = 'data-set-no-owner'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'

    await env.DB.prepare(
      `
      INSERT INTO pieces (id, data_set_id, cid)
      VALUES (?, ?, ?)
    `,
    )
      .bind('piece-1', dataSetId, cid)
      .run()

    await assert.rejects(
      async () =>
        await getStorageProviderAndValidateClient(env, clientAddress, cid),
      /no associated owner/,
    )
  })

  it('returns error if no payment rail', async () => {
    const cid = 'cid-unapproved'
    const dataSetId = 'data-set-unapproved'
    const storageProvider = APPROVED_STORAGE_PROVIDER
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO data_sets (id, storage_provider, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        dataSetId,
        storageProvider,
        clientAddress.replace('a', 'b'),
        APPROVED_STORAGE_PROVIDER,
        true,
      ),
      env.DB.prepare(
        'INSERT INTO pieces (id, data_set_id, cid) VALUES (?, ?, ?)',
      ).bind('piece-2', dataSetId, cid),
    ])

    await assert.rejects(
      async () =>
        await getStorageProviderAndValidateClient(env, clientAddress, cid),
      /There is no Filecoin Warm Storage Service deal for client/,
    )
  })

  it('returns error if withCDN=false', async () => {
    const cid = 'cid-unapproved'
    const dataSetId = 'data-set-unapproved'
    const owner = APPROVED_STORAGE_PROVIDER
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO data_sets (id, storage_provider, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(dataSetId, owner, clientAddress, APPROVED_STORAGE_PROVIDER, false),
      env.DB.prepare(
        'INSERT INTO pieces (id, data_set_id, cid) VALUES (?, ?, ?)',
      ).bind('piece-2', dataSetId, cid),
    ])

    await assert.rejects(
      async () =>
        await getStorageProviderAndValidateClient(env, clientAddress, cid),
      /withCDN=false/,
    )
  })

  it('returns storageProvider for approved owner', async () => {
    const cid = 'cid-approved'
    const dataSetId = 'data-set-approved'
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO data_sets (id, storage_provider, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        dataSetId,
        APPROVED_STORAGE_PROVIDER,
        clientAddress,
        APPROVED_STORAGE_PROVIDER,
        true,
      ),
      env.DB.prepare(
        'INSERT INTO pieces (id, data_set_id, cid) VALUES (?, ?, ?)',
      ).bind('piece-3', dataSetId, cid),
    ])

    const result = await getStorageProviderAndValidateClient(
      env,
      clientAddress,
      cid,
    )

    assert.strictEqual(result.storageProvider, APPROVED_STORAGE_PROVIDER)
  })
  it('returns owner for valid pieceCid with mixed-case owner (case insensitive)', async () => {
    const dataSetId = 'data-set-1'
    const pieceCid = 'piece-cid-1'
    const mixedCaseStorageProvider =
      '0x2A06D234246eD18b6C91de8349fF34C22C7268e8'
    const expectedStorageProvider = mixedCaseStorageProvider.toLowerCase()
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'

    await withApprovedProvider(env, {
      id: 20,
      beneficiary: mixedCaseStorageProvider,
    })

    // Insert a proof set with a mixed-case owner
    await env.DB.prepare(
      'INSERT INTO data_sets (id, storage_provider, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        dataSetId,
        mixedCaseStorageProvider,
        clientAddress,
        mixedCaseStorageProvider,
        true,
      )
      .run()

    // Insert a root CID linked to the proof set
    await env.DB.prepare(
      'INSERT INTO pieces (id, data_set_id, cid) VALUES (?, ?, ?)',
    )
      .bind('piece-1', dataSetId, pieceCid)
      .run()

    // Lookup by pieceCid and assert returned owner is normalized to lowercase
    const result = await getStorageProviderAndValidateClient(
      env,
      clientAddress,
      pieceCid,
    )
    assert.strictEqual(result.storageProvider, expectedStorageProvider)
  })
  it('returns the storage provider first in the ordering when multiple storage providers share the same pieceCid', async () => {
    const dataSetId1 = 'data-set-a'
    const dataSetId2 = 'data-set-b'
    const pieceCid = 'shared-piece-cid'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
    const storageProvider1 = '0x2A06D234246eD18b6C91de8349fF34C22C7268e7'
    const storageProvider2 = '0x2A06D234246eD18b6C91de8349fF34C22C7268e9'

    await withApprovedProvider(env, { id: 30, beneficiary: storageProvider1 })
    await withApprovedProvider(env, { id: 31, beneficiary: storageProvider2 })

    // Insert both owners into separate sets with the same pieceCid
    await env.DB.prepare(
      'INSERT INTO data_sets (id, storage_provider, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(dataSetId1, storageProvider1, clientAddress, storageProvider1, true)
      .run()

    await env.DB.prepare(
      'INSERT INTO data_sets (id, storage_provider, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(dataSetId2, storageProvider2, clientAddress, storageProvider2, true)
      .run()

    // Insert same pieceCid for both sets
    await env.DB.prepare(
      'INSERT INTO pieces (id, data_set_id, cid) VALUES (?, ?, ?)',
    )
      .bind('piece-a', dataSetId1, pieceCid)
      .run()

    await env.DB.prepare(
      'INSERT INTO pieces (id, data_set_id, cid) VALUES (?, ?, ?)',
    )
      .bind('piece-b', dataSetId2, pieceCid)
      .run()

    // Should return only the storageProvider1 which is the first in the ordering
    const result = await getStorageProviderAndValidateClient(
      env,
      clientAddress,
      pieceCid,
    )
    assert.strictEqual(result.storageProvider, storageProvider1.toLowerCase())
  })

  it('ignores owners that are not approved by Filecoin Warm Storage Service', async () => {
    const dataSetId1 = 0
    const dataSetId2 = 1
    const pieceCid = 'shared-piece-cid'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
    const storageProvider1 = '0x1006D234246eD18b6C91de8349fF34C22C726801'
    const storageProvider2 = '0x2006D234246eD18b6C91de8349fF34C22C726802'

    await withApprovedProvider(env, {
      id: 40,
      beneficiary: storageProvider1,
      serviceUrl: 'https://pdp-provider-1.xyz',
    })

    // NOTE: the second owner is not registered as an approved provider

    // Important: we must insert the unapproved provider first!
    await withDataSetPieces(env, {
      payer: clientAddress,
      storageProvider: storageProvider2,
      payee: storageProvider2,
      dataSetId: dataSetId2,
      withCDN: true,
      pieceCid,
    })

    await withDataSetPieces(env, {
      payer: clientAddress,
      storageProvider: storageProvider1,
      payee: storageProvider1,
      dataSetId: dataSetId1,
      withCDN: true,
      pieceCid,
    })

    // Should return storageProvider1 because storageProvider2 is not approved
    const result = await getStorageProviderAndValidateClient(
      env,
      clientAddress,
      pieceCid,
    )
    assert.deepStrictEqual(result, {
      dataSetId: dataSetId1,
      storageProvider: storageProvider1.toLowerCase(),
      serviceUrl: 'https://pdp-provider-1.xyz',
    })
  })
})

describe('updateDataSetStats', () => {
  it('inserts and updates egress stats', async () => {
    const DATA_SET_ID = 'test-data-set-1'
    const EGRESS_BYTES = 123456

    await updateDataSetSats(env, {
      dataSetId: DATA_SET_ID,
      egressBytes: EGRESS_BYTES,
    })

    const { results: insertResults } = await env.DB.prepare(
      `SELECT id, total_egress_bytes_used 
       FROM data_sets
       WHERE id = ?`,
    )
      .bind(DATA_SET_ID)
      .all()

    assert.deepStrictEqual(insertResults, [
      {
        id: DATA_SET_ID,
        total_egress_bytes_used: EGRESS_BYTES,
      },
    ])

    // Update the egress stats
    await updateDataSetSats(env, {
      dataSetId: DATA_SET_ID,
      egressBytes: 1000,
    })

    const { results: updateResults } = await env.DB.prepare(
      `SELECT id, total_egress_bytes_used 
       FROM data_sets 
       WHERE id = ?`,
    )
      .bind(DATA_SET_ID)
      .all()

    assert.deepStrictEqual(updateResults, [
      {
        id: DATA_SET_ID,
        total_egress_bytes_used: EGRESS_BYTES + 1000,
      },
    ])
  })
})
