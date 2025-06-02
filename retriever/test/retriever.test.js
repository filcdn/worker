import { describe, it, expect, vi } from 'vitest'
import workerImpl from '../bin/retriever.js'
import { createHash } from 'node:crypto'
import {
  retrieveFile,
  retrieveFile as defaultRetrieveFile,
} from '../lib/retrieval.js'
import { env } from 'cloudflare:test'
import assert from 'node:assert/strict'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const DNS_ROOT = '.filcdn.io'
env.DNS_ROOT = DNS_ROOT

describe('retriever.fetch', () => {
  const defaultClientAddress = '0x1234567890abcdef1234567890abcdef12345678'
  const defaultPieceCid =
    'baga6ea4seaqkzso6gijktpl22dxarxq25iynurceicxpst35yjrcp72uq3ziwpi'
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

  it('returns the response from retrieveFile', async () => {
    const fakeResponse = new Response('hello', {
      status: 201,
      headers: { 'X-Test': 'yes' },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: true,
      contentLength: 1234,
    })
    const req = withRequest('0xDead', 'baga1234')
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('hello')
    expect(res.headers.get('X-Test')).toBe('yes')
  })

  it('fetches the file from calibnet storage provider', async () => {
    const expectedHash =
      '61214c558a8470634437a941420a258c43ef1e89364d7347f02789f5a898dcb1'
    const req = withRequest('0xDead', defaultPieceCid)
    const res = await worker.fetch(req, env, { retrieveFile })

    expect(res.status).toBe(200)
    // get the sha256 hash of the content
    const content = await res.bytes()
    const hash = createHash('sha256').update(content).digest('hex')
    expect(hash).toEqual(expectedHash)
  })
  it('stores retrieval results with cache miss and content length set in D1', async () => {
    const fakeResponse = new Response('file', {
      status: 200,
      headers: {
        'CF-Cache-Status': 'MISS',
        'Content-Length': '1234',
      },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: true,
      contentLength: 1234,
    })
    const req = withRequest(defaultClientAddress, defaultPieceCid)
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
        egress_bytes: 1234,
        cache_miss: 1, // 1 for true, 0 for false
      },
    ])
  })
  it('stores retrieval results with cache hit and content length set in D1', async () => {
    const fakeResponse = new Response('file', {
      status: 200,
      headers: {
        'CF-Cache-Status': 'HIT',
        'Content-Length': '1234',
      },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: false,
      contentLength: 1234,
    })
    const req = withRequest(defaultClientAddress, defaultPieceCid)
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
        egress_bytes: 1234,
        cache_miss: 0, // 1 for true, 0 for false
      },
    ])
  })
  it('stores retrieval results content length not set in D1', async () => {
    const fakeResponse = new Response('file', {
      status: 200,
      headers: {
        'CF-Cache-Status': 'HIT',
      },
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue({
      response: fakeResponse,
      cacheMiss: false,
      contentLength: undefined,
    })
    const req = withRequest(defaultClientAddress, defaultPieceCid)
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
    // If content length is not set, egress_bytes should be 0
    assert.deepStrictEqual(result, [
      {
        id: 1, // Assuming this is the first log entry
        client_address: defaultClientAddress,
        response_status: 200,
        egress_bytes: 0,
        cache_miss: 0, // 1 for true, 0 for false
      },
    ])
  })
  it('stores retrieval performance stats in D1', async () => {
    const fakeResponse = new Response('file', {
      status: 200,
      headers: {
        'CF-Cache-Status': 'MISS',
        'Content-Length': '1234',
      },
    })
    const mockRetrieveFile = async () => {
      await sleep(1) // Simulate a delay
      return {
        response: fakeResponse,
        cacheMiss: true,
        contentLength: 1234,
      }
    }
    const req = withRequest(defaultClientAddress, defaultPieceCid)
    const res = await worker.fetch(req, env, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const readOutput = await env.DB.prepare(
      `SELECT response_status, fetch_ttfb, worker_ttfb, client_address
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
    assert.strictEqual(typeof result.worker_ttfb, 'number')
  })
  it('stores request country code in D1', async () => {
    const mockRetrieveFile = async () => {
      return {
        response: new Response('file', {
          status: 200,
        }),
        cacheMiss: true,
        contentLength: 1234,
      }
    }
    const req = withRequest(defaultClientAddress, defaultPieceCid, 'GET', {
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
})

/**
 * @param {string} clientWalletAddress
 * @param {string} pieceCid
 * @param {string} method
 * @param {Object} headers
 * @returns {Request}
 */
function withRequest(
  clientWalletAddress,
  pieceCid,
  method = 'GET',
  headers = {},
) {
  let url = 'http://'
  if (clientWalletAddress) url += `${clientWalletAddress}.`
  url += DNS_ROOT.slice(1) // remove the trailing '.'
  if (pieceCid) url += `/${pieceCid}`

  return new Request(url, { method, headers })
}
