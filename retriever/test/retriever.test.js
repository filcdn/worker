import { describe, it, expect, vi, beforeAll } from 'vitest'
import workerImpl from '../bin/retriever.js'
import { createHash } from 'node:crypto'
import {
  retrieveFile,
  retrieveFile as defaultRetrieveFile,
} from '../lib/retrieval.js'
import { env } from 'cloudflare:test'
import assert from 'node:assert/strict'
import {
  withProofSetRoots,
  withApprovedProvider,
} from './test-data-builders.js'
import { CONTENT_STORED_ON_CALIBRATION } from './test-data.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const DNS_ROOT = '.filcdn.io'
env.DNS_ROOT = DNS_ROOT

describe('retriever.fetch', () => {
  const defaultClientAddress = '0x1234567890abcdef1234567890abcdef12345678'
  const realRootCid = CONTENT_STORED_ON_CALIBRATION[0].rootCid
  const worker = {
    fetch: async (
      request,
      env,
      { retrieveFile = defaultRetrieveFile, signal } = {},
    ) => {
      const waitUntilCalls = []
      const ctx = {
        waitUntil: (promise) => {
          waitUntilCalls.push(promise)
        },
      }
      const response = await workerImpl.fetch(request, env, ctx, {
        retrieveFile,
        signal,
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
    for (const {
      owner,
      pieceRetrievalUrl,
      rootCid,
      proofSetId,
    } of CONTENT_STORED_ON_CALIBRATION) {
      const rootId = `root-${i}`
      const railId = `rail-${i}`
      await withProofSetRoots(env, {
        owner,
        rootCid,
        clientAddress: defaultClientAddress,
        withCDN: true,
        proofSetId,
        railId,
        rootId,
      })
      await withApprovedProvider(env, {
        ownerAddress: owner,
        pieceRetrievalUrl,
      })
      i++
    }
  })

  it('redirects to https://filcdn.com when no CID was provided', async () => {
    const req = new Request(`https://${defaultClientAddress}${DNS_ROOT}/`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://filcdn.com/')
  })

  it('redirects to https://filcdn.com when no CID and no wallet address were provided', async () => {
    const req = new Request(`https://${DNS_ROOT.slice(1)}/`)
    const res = await worker.fetch(req, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://filcdn.com/')
  })

  it('returns 405 for unsupported request methods', async () => {
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

  it('sets Content-Security-Policy response header', async () => {
    const originResponse = new Response('hello', {
      headers: {
        'Content-Security-Policy': 'report-uri: https://endpoint.example.com',
      },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: originResponse,
      cacheMiss: true,
    })
    const req = withRequest(defaultClientAddress, realRootCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toMatch(/^default-src: 'self'/)
    expect(csp).toContain('https://*.filcdn.io')
  })

  it('fetches the file from calibration storage provider', async () => {
    const expectedHash =
      '8a56ccfc341865af4ec1c2d836e52e71dcd959e41a8522f60bfcc3ff4e99d388'
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
      const controller = new AbortController()
      const { signal } = controller
      const tasks = CONTENT_STORED_ON_CALIBRATION.map(({ owner, rootCid }) => {
        return (async () => {
          try {
            const req = withRequest(defaultClientAddress, rootCid)
            const res = await worker.fetch(req, env, { retrieveFile, signal })

            assert.strictEqual(res.status, 200)

            const content = await res.arrayBuffer()
            const actualBytes = content.byteLength

            const { results } = await env.DB.prepare(
              'SELECT egress_bytes FROM retrieval_logs WHERE client_address = ? AND owner_address = ?',
            )
              .bind(defaultClientAddress, owner)
              .all()

            assert.strictEqual(results.length, 1)
            assert.strictEqual(results[0].egress_bytes, actualBytes)

            return { owner, success: true }
          } catch (err) {
            console.warn(
              `⚠️ Warning: Fetch or verification failed for owner ${owner}:`,
              err,
            )
            throw err
          }
        })()
      })

      try {
        await Promise.any(tasks)
        controller.abort() // Abort remaining tasks if one succeeds
      } catch (err) {
        const ownersChecked = CONTENT_STORED_ON_CALIBRATION.map((o) => o.owner)
        throw new Error(
          `❌ All owners failed to fetch. Owners checked: ${ownersChecked.join(', ')}`,
        )
      }
    },
  )

  it('requests payment if withCDN=false', async () => {
    const proofSetId = 'test-proof-set-no-cdn'
    const railId = 'rail-no-cdn'
    const rootId = 'root-no-cdn'
    const rootCid =
      'baga6ea4seaqaleibb6ud4xeemuzzpsyhl6cxlsymsnfco4cdjka5uzajo2x4ipa'
    const owner = '0xOWNER'
    await withProofSetRoots(env, {
      owner,
      rootCid,
      proofSetId,
      railId,
      withCDN: false,
      rootId,
    })

    const req = withRequest(defaultClientAddress, rootCid, 'GET')
    const res = await worker.fetch(req, env)

    assert.strictEqual(res.status, 402)
  })
  it('reads the provider URL from the database, comparing owner address case-insensitively', async () => {
    const providerAddress = '0x2A06D234246eD18b6C91de8349fF34C22C7268e9'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345608'
    const rootCid = 'bagaTest'
    const body = 'file content'

    expect(providerAddress.toLowerCase()).not.toEqual(providerAddress)

    await withProofSetRoots(env, {
      owner: providerAddress,
      rootCid,
      clientAddress,
    })

    await withApprovedProvider(env, {
      ownerAddress: providerAddress,
      pieceRetrievalUrl: 'https://mock-pdp-url.com',
    })

    const mockRetrieveFile = async () => {
      return {
        response: new Response(body, {
          status: 200,
        }),
        cacheMiss: true,
      }
    }

    const req = withRequest(clientAddress, rootCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })

    // Check if the URL fetched is from the database
    expect(await res.text()).toBe(body)
    expect(res.status).toBe(200)
  })

  it('throws an error if the providerAddress is not found in the database', async () => {
    const providerAddress = '0x2A06D234246eD18b6C91de8349fF34C22C720000'
    const clientAddress = '0x2A06D234246eD18b6C91de8349fF34C22C7268e8'
    const rootCid = 'bagaTest'

    await withProofSetRoots(env, {
      owner: providerAddress,
      rootCid,
      clientAddress,
    })

    const req = withRequest(clientAddress, rootCid)
    const res = await worker.fetch(req, env)

    // Expect an error because no URL was found
    expect(res.status).toBe(404)
    expect(await res.text()).toBe(
      `No approved storage provider found for client '0x2a06d234246ed18b6c91de8349ff34c22c7268e8' and root_cid 'bagaTest'.`,
    )
  })

  it('supports HEAD requests', async () => {
    const fakeResponse = new Response('file content', {
      status: 200,
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: true,
    })
    const req = withRequest(defaultClientAddress, realRootCid, 'HEAD')
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(200)
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
  url += DNS_ROOT.slice(1) // remove the leading '.'
  if (rootCid) url += `/${rootCid}`

  return new Request(url, { method, headers })
}
