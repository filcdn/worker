import { describe, it, expect, vi, beforeAll } from 'vitest'
import worker from '../bin/worker.js'
import { createHash } from 'node:crypto'
import { retrieveFile } from '../lib/retrieval.js'
import { applyMigrations } from './setup-db.js'
import { env } from 'cloudflare:test'
import assert from 'node:assert/strict'

beforeAll(() => {
  applyMigrations(env)
})

const DNS_ROOT = '.filcdn.io'

describe('worker.fetch', () => {
  it('returns 405 for non-GET requests', async () => {
    const req = withRequest(1, 'foo', 'POST')
    const res = await worker.fetch(req, { DNS_ROOT }, {})
    expect(res.status).toBe(405)
    expect(await res.text()).toBe('Method Not Allowed')
  })

  it('returns 400 if required fields are missing', async () => {
    const mockRetrieveFile = vi.fn()
    const req = withRequest(undefined, 'foo')
    const res = await worker.fetch(req, { DNS_ROOT }, {}, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Invalid hostname: filcdn.io. It must end with .filcdn.io.')
  })

  it('returns the response from retrieveFile', async () => {
    const fakeResponse = new Response('hello', { status: 201, headers: { 'X-Test': 'yes' } })
    const mockRetrieveFile = vi.fn().mockResolvedValue(fakeResponse)
    const req = withRequest('0xDead', 'baga1234')
    console.log(req)
    const res = await worker.fetch(req, { DNS_ROOT }, {}, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('hello')
    expect(res.headers.get('X-Test')).toBe('yes')
  })

  it('fetches the file from calibnet storage provider', async () => {
    const expectedHash = '61214c558a8470634437a941420a258c43ef1e89364d7347f02789f5a898dcb1'
    const pieceCid = 'baga6ea4seaqkzso6gijktpl22dxarxq25iynurceicxpst35yjrcp72uq3ziwpi'

    const req = withRequest('0xDead', pieceCid)
    const res = await worker.fetch(req, { DNS_ROOT }, {}, { retrieveFile })

    expect(res.status).toBe(200)
    // get the sha256 hash of the content
    const content = await res.bytes()
    const hash = createHash('sha256').update(content).digest('hex')
    expect(hash).toEqual(expectedHash)
  })
  it('stores retrieval results with cache miss and content length set in D1', async () => {
    const pieceCid = 'PIECE_CID_FOR_CACHE_MISS_TEST'
    const clientAddress = '0x1234567890abcdef1234567890abcdef12345678'
    const fakeResponse = new Response('file', {
      status: 200,
      headers: {
        'CF-Cache-Status': 'MISS',
        'Content-Length': '1234'
      }
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue(fakeResponse)
    const req = withRequest(196, pieceCid)
    const res = await worker.fetch(req, env, {}, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const readOutput = await env.DB.prepare(
      `SELECT id, owner_address, response_status, egress_bytes, cache_miss, client_address
       FROM retrieval_logs 
       WHERE client_address = ?`
    ).bind(pieceCid).all()
    const result = readOutput.results
    assert.deepStrictEqual(result, [
      {
        id: 1, // Assuming this is the first log entry
        hostname: 'yablu.net',
        piece_cid: pieceCid,
        response_status: 200,
        egress_bytes: 1234,
        cache_miss: 1, // 1 for true, 0 for false
        proof_set_id: 196
      }
    ])
  })
  it('stores retrieval results with cache hit and content length set in D1', async () => {
    const pieceCid = 'PIECE_CID_FOR_CACHE_HIT_TEST'
    const fakeResponse = new Response('file', {
      status: 200,
      headers: {
        'CF-Cache-Status': 'HIT',
        'Content-Length': '1234'
      }
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue(fakeResponse)
    const req = withRequest(196, pieceCid)
    const res = await worker.fetch(req, env, {}, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const readOutput = await env.DB.prepare(
      `SELECT id, owner_address, response_status, egress_bytes, cache_miss, client_address 
       FROM retrieval_logs 
       WHERE client_address = ?`
    ).bind(pieceCid).all()
    const result = readOutput.results
    assert.deepStrictEqual(result, [
      {
        id: 1, // Assuming this is the first log entry
        hostname: 'yablu.net',
        piece_cid: pieceCid,
        response_status: 200,
        egress_bytes: 1234,
        cache_miss: 0, // 1 for true, 0 for false
        proof_set_id: 196
      }
    ])
  })
  it('stores retrieval results content length not set in D1', async () => {
    const pieceCid = 'PIECE_CID_FOR_CONTENT_LENGTH_NOT_SET_TEST'
    const fakeResponse = new Response('file', {
      status: 200,
      headers: {
        'CF-Cache-Status': 'HIT'
      }
    })
    const mockRetrieveFile = vi.fn().mockResolvedValue(fakeResponse)
    const req = withRequest(196, pieceCid)
    const res = await worker.fetch(req, env, {}, { retrieveFile: mockRetrieveFile })
    assert.strictEqual(res.status, 200)
    const readOutput = await env.DB.prepare(
      `SELECT id, owner_address, piece_cid, response_status, egress_bytes, cache_miss, client_address 
       FROM retrieval_logs 
       WHERE client_address = ?`
    ).bind(pieceCid).all()
    const result = readOutput.results
    // If content length is not set, egress_bytes should be 0
    assert.deepStrictEqual(result, [
      {
        id: 1, // Assuming this is the first log entry
        hostname: 'yablu.net',
        piece_cid: pieceCid,
        response_status: 200,
        egress_bytes: 0,
        cache_miss: 0, // 1 for true, 0 for false
        proof_set_id: 196
      }
    ])
  })
})

/**
 *
 * @param {string} clientWalletAddress
 * @param {string} pieceCid
 * @param {string} method
 *
 * @returns {Request}
 */
function withRequest (clientWalletAddress, pieceCid, method = 'GET') {
  let url = 'http://'
  if (clientWalletAddress) url += `${clientWalletAddress}.`
  url += DNS_ROOT.slice(1) // remove the trailing '.'
  if (pieceCid) url += `/${pieceCid}`
  console.log('REQUEST URL:', url)

  return new Request(url, { method })
}
