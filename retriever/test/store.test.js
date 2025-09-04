import { describe, it, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import {
  logRetrievalResult,
  getStorageProviderAndValidateClient,
  updateDataSetStats,
} from '../lib/store.js'
import { env } from 'cloudflare:test'
import {
  withDataSetPieces,
  withApprovedProvider,
} from './test-data-builders.js'

describe('logRetrievalResult', () => {
  it('inserts a log into local D1 via logRetrievalResult and verifies it', async () => {
    const DATA_SET_ID = '1'

    await logRetrievalResult(env, {
      dataSetId: DATA_SET_ID,
      cacheMiss: false,
      egressBytes: 1234,
      responseStatus: 200,
      timestamp: new Date().toISOString(),
      requestCountryCode: 'US',
    })

    const readOutput = await env.DB.prepare(
      `SELECT 
        data_set_id,
        response_status,
        egress_bytes,
        cache_miss,
        request_country_code
      FROM retrieval_logs 
      WHERE data_set_id = '${DATA_SET_ID}'`,
    ).all()
    const result = readOutput.results
    assert.deepStrictEqual(result, [
      {
        data_set_id: DATA_SET_ID,
        response_status: 200,
        egress_bytes: 1234,
        cache_miss: 0,
        request_country_code: 'US',
      },
    ])
  })
})

describe('getStorageProviderAndValidateClient', () => {
  const APPROVED_SERVICE_PROVIDER_ID = 20
  const APPROVED_SERVICE_PROVIDER_ADDRESS =
    '0xcb9e86945ca31e6c3120725bf0385cbad684040c'
  beforeAll(async () => {
    await withApprovedProvider(env, {
      id: APPROVED_SERVICE_PROVIDER_ID,
      serviceUrl: 'https://approved-provider.xyz',
    })
  })

  it('returns storage provider for valid pieceCid', async () => {
    const dataSetId = 'test-set-1'
    const pieceCid = 'test-cid-1'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'

    await env.DB.prepare(
      'INSERT INTO data_sets (id, service_provider_id, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        dataSetId,
        APPROVED_SERVICE_PROVIDER_ID,
        clientAddress,
        APPROVED_SERVICE_PROVIDER_ADDRESS,
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
    assert.strictEqual(
      result.storageProviderAddress,
      APPROVED_SERVICE_PROVIDER_ADDRESS,
    )
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

  it('throws error if data_set_id exists but has no associated storage provider', async () => {
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
      /no associated storage provider/,
    )
  })

  it('returns error if no payment rail', async () => {
    const cid = 'cid-unapproved'
    const dataSetId = 'data-set-unapproved'
    const storageProviderAddress = APPROVED_SERVICE_PROVIDER_ADDRESS
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO data_sets (id, storage_provider_address, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        dataSetId,
        storageProviderAddress,
        clientAddress.replace('a', 'b'),
        APPROVED_SERVICE_PROVIDER_ADDRESS,
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
    const storageProviderAddress = APPROVED_SERVICE_PROVIDER_ADDRESS
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO data_sets (id, storage_provider_address, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        dataSetId,
        storageProviderAddress,
        clientAddress,
        APPROVED_SERVICE_PROVIDER_ADDRESS,
        false,
      ),
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

  it('returns storageProviderAddress for approved owner', async () => {
    const cid = 'cid-approved'
    const dataSetId = 'data-set-approved'
    const clientAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO data_sets (id, storage_provider_address, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        dataSetId,
        APPROVED_SERVICE_PROVIDER_ADDRESS,
        clientAddress,
        APPROVED_SERVICE_PROVIDER_ADDRESS,
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

    assert.strictEqual(
      result.storageProviderAddress,
      APPROVED_SERVICE_PROVIDER_ADDRESS,
    )
  })
  it('returns the storage provider first in the ordering when multiple storage providers share the same pieceCid', async () => {
    const dataSetId1 = 'data-set-a'
    const dataSetId2 = 'data-set-b'
    const pieceCid = 'shared-piece-cid'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
    const storageProviderAddress1 = '0x2a06d234246ed18b6c91de8349ff34c22c7268e7'
    const storageProviderAddress2 = '0x2a06d234246ed18b6c91de8349ff34c22c7268e9'

    await withApprovedProvider(env, {
      id: 30,
    })
    await withApprovedProvider(env, {
      id: 31,
    })

    // Insert both owners into separate sets with the same pieceCid
    await env.DB.prepare(
      'INSERT INTO data_sets (id, storage_provider_address, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        dataSetId1,
        storageProviderAddress1,
        clientAddress,
        storageProviderAddress1,
        true,
      )
      .run()

    await env.DB.prepare(
      'INSERT INTO data_sets (id, storage_provider_address, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        dataSetId2,
        storageProviderAddress2,
        clientAddress,
        storageProviderAddress2,
        true,
      )
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

    // Should return only the storageProviderAddress1 which is the first in the ordering
    const result = await getStorageProviderAndValidateClient(
      env,
      clientAddress,
      pieceCid,
    )
    assert.strictEqual(result.storageProviderAddress, storageProviderAddress1)
  })

  it('ignores owners that are not approved by Filecoin Warm Storage Service', async () => {
    const dataSetId1 = '0'
    const dataSetId2 = '1'
    const pieceCid = 'shared-piece-cid'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
    const storageProviderAddress1 = '0x1006d234246ed18b6c91de8349ff34c22c726801'
    const storageProviderAddress2 = '0x2006d234246ed18b6c91de8349ff34c22c726801'

    await withApprovedProvider(env, {
      id: 40,
      serviceUrl: 'https://pdp-provider-1.xyz',
    })

    // NOTE: the second owner is not registered as an approved provider

    // Important: we must insert the unapproved provider first!
    await withDataSetPieces(env, {
      payerAddress: clientAddress,
      storageProviderAddress: storageProviderAddress2,
      payeeAddress: storageProviderAddress2,
      dataSetId: dataSetId2,
      withCDN: true,
      pieceCid,
    })

    await withDataSetPieces(env, {
      payerAddress: clientAddress,
      storageProviderAddress: storageProviderAddress1,
      payeeAddress: storageProviderAddress1,
      dataSetId: dataSetId1,
      withCDN: true,
      pieceCid,
    })

    // Should return storageProviderAddress1 because storageProviderAddress2 is not approved
    const result = await getStorageProviderAndValidateClient(
      env,
      clientAddress,
      pieceCid,
    )
    assert.deepStrictEqual(result, {
      dataSetId: dataSetId1,
      storageProviderAddress: storageProviderAddress1.toLowerCase(),
      serviceUrl: 'https://pdp-provider-1.xyz',
    })
  })
})

describe('updateDataSetStats', () => {
  it('updates egress stats', async () => {
    const DATA_SET_ID = 'test-data-set-1'
    const EGRESS_BYTES = 123456

    await withDataSetPieces(env, {
      dataSetId: DATA_SET_ID,
    })
    await updateDataSetStats(env, {
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
    await updateDataSetStats(env, {
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
