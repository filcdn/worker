import { describe, it, expect, vi, beforeAll } from 'vitest'
import workerImpl from '../bin/retriever.js'
import { createHash } from 'node:crypto'
import {
  retrieveFile,
  retrieveFile as defaultRetrieveFile,
} from '../lib/retrieval.js'
import { env } from 'cloudflare:test'
import assert from 'node:assert/strict'
import { OWNER_TO_RETRIEVAL_URL_MAPPING } from '../lib/constants.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const DNS_ROOT = '.filcdn.io'
env.DNS_ROOT = DNS_ROOT

describe('retriever.fetch', () => {
  const defaultClientAddress = '0x1234567890abcdef1234567890abcdef12345678'
  const realRootCid =
    'baga6ea4seaqntcagzjqzor3qxjba2mybegc6d2jxiewxinkd72ecll6xqicqcfa'
  const worker = {
    fetch: async (
      request,
      env,
      { retrieveFile = defaultRetrieveFile } = {},
    ) => {
      const waitUntilCalls = []
      const ctx = {
        waitUntil: (promise) => {
          waitUntilCalls.push(promise)
        },
      }
      const response = await workerImpl.fetch(request, env, ctx, {
        retrieveFile,
      })
      await Promise.all(waitUntilCalls)
      return response
    },
  }

  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM indexer_roots'),
      env.DB.prepare('DELETE FROM indexer_proof_sets'),
      env.DB.prepare('DELETE FROM indexer_proof_set_rails'),
    ])

    let i = 1
    for (const [
      owner,
      {
        sample: { rootCid, proofSetId },
      },
    ] of Object.entries(OWNER_TO_RETRIEVAL_URL_MAPPING)) {
      const rootId = `root-${i}`
      const railId = `rail-${i}`

      await env.DB.batch([
        env.DB.prepare(
          `
          INSERT INTO indexer_proof_sets (set_id, owner)
          VALUES (?, ?)
        `,
        ).bind(proofSetId, owner),

        env.DB.prepare(
          `
          INSERT INTO indexer_roots (root_id, set_id, root_cid)
          VALUES (?, ?, ?)
        `,
        ).bind(rootId, proofSetId, rootCid),
        env.DB.prepare(
          `
          INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn)
          VALUES (?, ?, ?, ?, ?)
        `,
        ).bind(proofSetId, railId, defaultClientAddress, owner, true),
      ])

      i++
    }
  })

  it('returns 405 for non-GET requests', async () => {
    const req = withRequest(1, 'foo', 'POST')
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(405)
    expect(await res.text()).toBe('Method Not Allowed')
  })

  it('returns 400 if required fields are missing', async () => {
    const mockRetrieveFile = vi.fn()
    const req = withRequest(undefined, 'foo')
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      'Invalid hostname: filcdn.io. It must end with .filcdn.io.',
    )
  })

  it('returns 400 if provided client address is invalid', async () => {
    const mockRetrieveFile = vi.fn()
    const req = withRequest('bar', realRootCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      'Invalid address: bar. Address must be a valid ethereum address.',
    )
  })

  it('returns the response from retrieveFile', async () => {
    const fakeResponse = new Response('hello', {
      status: 201,
      headers: { 'X-Test': 'yes' },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: true,
    })
    const req = withRequest(defaultClientAddress, realRootCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('hello')
    expect(res.headers.get('X-Test')).toBe('yes')
  })

  it('fetches the file from calibration storage provider', async () => {
    const expectedHash =
      '358f5611998981d5c5584ca2457f5b87afdf7b69650e1919f6e28f0f76943491'
    const req = withRequest(defaultClientAddress, realRootCid)
    const res = await worker.fetch(req, env, { retrieveFile })
    expect(res.status).toBe(200)
    // get the sha256 hash of the content
    const content = await res.bytes()
    const hash = createHash('sha256').update(content).digest('hex')
    expect(hash).toEqual(expectedHash)
  })
  it('stores retrieval results with cache miss and content length set in D1', async () => {
    const body = 'file content'
    const expectedEgressBytes = Buffer.byteLength(body, 'utf8')
    const fakeResponse = new Response(body, {
      status: 200,
      headers: {
        'CF-Cache-Status': 'MISS',
      },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: true,
    })
    const req = withRequest(defaultClientAddress, realRootCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const readOutput = await env.DB.prepare(
      `SELECT id, response_status, egress_bytes, cache_miss, client_address
       FROM retrieval_logs
       WHERE client_address = ?`,
    )
      .bind(defaultClientAddress)
      .all()
    const result = readOutput.results
    assert.deepStrictEqual(result, [
      {
        id: 1, // Assuming this is the first log entry
        client_address: defaultClientAddress,
        response_status: 200,
        egress_bytes: expectedEgressBytes,
        cache_miss: 1, // 1 for true, 0 for false
      },
    ])
  })
  it('stores retrieval results with cache hit and content length set in D1', async () => {
    const body = 'file content'
    const expectedEgressBytes = Buffer.byteLength(body, 'utf8')
    const fakeResponse = new Response(body, {
      status: 200,
      headers: {
        'CF-Cache-Status': 'HIT',
      },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: false,
    })
    const req = withRequest(defaultClientAddress, realRootCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const readOutput = await env.DB.prepare(
      `SELECT id, response_status, egress_bytes, cache_miss, client_address
       FROM retrieval_logs
       WHERE client_address = ?`,
    )
      .bind(defaultClientAddress)
      .all()
    const result = readOutput.results
    assert.deepStrictEqual(result, [
      {
        id: 1, // Assuming this is the first log entry
        client_address: defaultClientAddress,
        response_status: 200,
        egress_bytes: expectedEgressBytes,
        cache_miss: 0, // 1 for true, 0 for false
      },
    ])
  })
  it('stores retrieval performance stats in D1', async () => {
    const body = 'file content'
    const fakeResponse = new Response(body, {
      status: 200,
      headers: {
        'CF-Cache-Status': 'MISS',
      },
    })
    const mockRetrieveFile = async () => {
      await sleep(1) // Simulate a delay
      return {
        response: fakeResponse,
        cacheMiss: true,
      }
    }
    const req = withRequest(defaultClientAddress, realRootCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const readOutput = await env.DB.prepare(
      `SELECT
        response_status,
        fetch_ttfb,
        fetch_ttlb,
        worker_ttfb,
        client_address
       FROM retrieval_logs
       WHERE client_address = ?`,
    )
      .bind(defaultClientAddress)
      .all()
    assert.strictEqual(readOutput.results.length, 1)
    const result = readOutput.results[0]

    assert.deepStrictEqual(result.client_address, defaultClientAddress)
    assert.strictEqual(result.response_status, 200)
    assert.strictEqual(typeof result.fetch_ttfb, 'number')
    assert.strictEqual(typeof result.fetch_ttlb, 'number')
    assert.strictEqual(typeof result.worker_ttfb, 'number')
  })
  it('stores request country code in D1', async () => {
    const body = 'file content'
    const mockRetrieveFile = async () => {
      return {
        response: new Response(body, {
          status: 200,
        }),
        cacheMiss: true,
      }
    }
    const req = withRequest(defaultClientAddress, realRootCid, 'GET', {
      'CF-IPCountry': 'US',
    })
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const { results } = await env.DB.prepare(
      `SELECT request_country_code
       FROM retrieval_logs
       WHERE client_address = ?`,
    )
      .bind(defaultClientAddress)
      .all()
    assert.deepStrictEqual(results, [
      {
        request_country_code: 'US',
      },
    ])
  })
  it('logs 0 egress bytes for empty body', async () => {
    const fakeResponse = new Response(null, {
      status: 200,
      headers: {
        'CF-Cache-Status': 'MISS',
      },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: true,
    })
    const req = withRequest(defaultClientAddress, realRootCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const readOutput = await env.DB.prepare(
      'SELECT egress_bytes FROM retrieval_logs WHERE client_address = ?',
    )
      .bind(defaultClientAddress)
      .all()
    assert.strictEqual(readOutput.results.length, 1)
    assert.strictEqual(readOutput.results[0].egress_bytes, 0)
  })
  it(
    'measures egress correctly from real storage provider',
    { timeout: 10000 },
    async () => {
      for (const [
        owner,
        {
          sample: { rootCid },
        },
      ] of Object.entries(OWNER_TO_RETRIEVAL_URL_MAPPING)) {
        const req = withRequest(defaultClientAddress, rootCid)

        const res = await worker.fetch(req, env, { retrieveFile })
        assert.strictEqual(
          res.status,
          200,
          `Failed for owner: ${owner}, url: ${OWNER_TO_RETRIEVAL_URL_MAPPING[owner].url}`,
        )

        const content = await res.arrayBuffer()
        const actualBytes = content.byteLength

        const { results } = await env.DB.prepare(
          'SELECT egress_bytes FROM retrieval_logs WHERE client_address = ? AND owner_address = ?',
        )
          .bind(defaultClientAddress, owner)
          .all()

        assert.strictEqual(results.length, 1)
        assert.strictEqual(results[0].egress_bytes, actualBytes)
      }
    },
  )
  it('matches retrieval URL for owner address case-insensitively', async () => {
    const body = 'file content'
    const rootCid =
      'baga6ea4seaqaleibb6ud4xeemuzzpsyhl6cxlsymsnfco4cdjka5uzajo2x4ipi'
    const mixedCaseOwner = '0x2A06D234246eD18b6C91de8349fF34C22C7268e8' // mixed case
    const expectedNormalizedOwner = mixedCaseOwner.toLowerCase()

    // Insert proof set and root into DB
    const proofSetId = 'test-proof-set-case'
    await env.DB.prepare(
      'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
    )
      .bind(proofSetId, mixedCaseOwner)
      .run()

    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
    )
      .bind('root-case-test', proofSetId, rootCid)
      .run()

    // Simulate file retrieval
    const mockRetrieveFile = async () => {
      return {
        response: new Response(body, {
          status: 200,
        }),
        cacheMiss: true,
      }
    }

    const req = withRequest(defaultClientAddress, rootCid, 'GET')
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })

    assert.strictEqual(res.status, 200)

    // Verify that request logged with correct (normalized) owner
    const { results } = await env.DB.prepare(
      'SELECT owner FROM indexer_proof_sets WHERE set_id = ?',
    )
      .bind(proofSetId)
      .all()

    assert.deepStrictEqual(results, [
      {
        owner: mixedCaseOwner, // Stored as mixed case
      },
    ])

    // Now verify that retrieval still worked based on case-insensitive matching
    const lookupKey = expectedNormalizedOwner
    const mappingEntry = OWNER_TO_RETRIEVAL_URL_MAPPING[lookupKey]
    assert.ok(mappingEntry)
    assert.strictEqual(mappingEntry.sample.rootCid, rootCid)
  })
  it('requests payment if withCDN=false', async () => {
    const proofSetId = 'test-proof-set-no-cdn'
    const railId = 'rail-no-cdn'
    const rootId = 'root-no-cdn'
    const rootCid =
      'baga6ea4seaqaleibb6ud4xeemuzzpsyhl6cxlsymsnfco4cdjka5uzajo2x4ipa'
    const owner = Object.keys(OWNER_TO_RETRIEVAL_URL_MAPPING)[0]

    await env.DB.batch([
      env.DB.prepare(
        `
        INSERT INTO indexer_proof_sets (set_id, owner)
        VALUES (?, ?)
      `,
      ).bind(proofSetId, owner),

      env.DB.prepare(
        `
        INSERT INTO indexer_roots (root_id, set_id, root_cid)
        VALUES (?, ?, ?)
      `,
      ).bind(rootId, proofSetId, rootCid),
      env.DB.prepare(
        `
        INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn)
        VALUES (?, ?, ?, ?, ?)
      `,
      ).bind(proofSetId, railId, defaultClientAddress, owner, false),
    ])

    const req = withRequest(defaultClientAddress, rootCid, 'GET')
    const res = await worker.fetch(req, env)

    assert.strictEqual(res.status, 402)
  })
  it('does not log to retrieval_logs on method not allowed (405)', async () => {
    const req = withRequest(defaultClientAddress, realRootCid, 'POST')
    const res = await worker.fetch(req, env)

    expect(res.status).toBe(405)
    expect(await res.text()).toBe('Method Not Allowed')

    const result = await env.DB.prepare(
      `SELECT response_status FROM retrieval_logs WHERE client_address = ? ORDER BY id DESC LIMIT 1`,
    )
      .bind(defaultClientAddress)
      .first()
    expect(result).toBeNull()
  })
  it('logs to retrieval_logs on unsupported storage provider (404)', async () => {
    const invalidRootCid = 'baga6ea4seaq3invalidrootcidfor404loggingtest'
    const proofSetId = 'unsupported-owner-test'
    const unsupportedOwner = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO indexer_proof_sets (set_id, owner) VALUES (?, ?)',
      ).bind(proofSetId, unsupportedOwner),
      env.DB.prepare(
        'INSERT INTO indexer_roots (root_id, set_id, root_cid) VALUES (?, ?, ?)',
      ).bind('root-unsupported', proofSetId, invalidRootCid),
      env.DB.prepare(
        'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        proofSetId,
        'rail-unsupported',
        defaultClientAddress,
        unsupportedOwner,
        true,
      ),
    ])

    const req = withRequest(defaultClientAddress, invalidRootCid)
    const res = await worker.fetch(req, env)

    expect(res.status).toBe(404)
    expect(await res.text()).toContain('exists but has no approved owner')

    const result = await env.DB.prepare(
      'SELECT * FROM retrieval_logs WHERE client_address = ?',
    )
      .bind(defaultClientAddress)
      .first()
    expect(result.response_status).toBe(404)
    expect(result.client_address).toBe(defaultClientAddress)
    expect(result.owner_address).toBe('') // No owner address logged
    expect(result.cache_miss).toBe(0)
    expect(result.egress_bytes).toBeNull()
  })
  it('does not log to retrieval_logs when client address is invalid (400)', async () => {
    const invalidAddress = 'not-an-address'
    const req = withRequest(invalidAddress, realRootCid)
    const res = await worker.fetch(req, env)

    expect(res.status).toBe(400)
    expect(await res.text()).toContain('Invalid address')

    const result = await env.DB.prepare(
      'SELECT * FROM retrieval_logs WHERE client_address = ? LIMIT 1',
    )
      .bind(invalidAddress)
      .first()

    expect(result).toBeNull() // No logs should be created for invalid client address
  })
})

/**
 * @param {string} clientWalletAddress
 * @param {string} rootCid
 * @param {string} method
 * @param {Object} headers
 * @returns {Request}
 */
function withRequest(
  clientWalletAddress,
  rootCid,
  method = 'GET',
  headers = {},
) {
  let url = 'http://'
  if (clientWalletAddress) url += `${clientWalletAddress}.`
  url += DNS_ROOT.slice(1) // remove the trailing '.'
  if (rootCid) url += `/${rootCid}`

  return new Request(url, { method, headers })
}
