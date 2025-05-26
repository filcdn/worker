import { describe, it, expect, vi } from 'vitest'
import worker from '../bin/worker.js'
import { createHash } from 'node:crypto'
import { retrieveFile } from '../lib/retrieval.js'

describe('worker.fetch', () => {
  it('returns 405 for non-GET requests', async () => {
    const req = withRequest(1, 'foo', 'POST')
    const res = await worker.fetch(req, {}, {})
    expect(res.status).toBe(405)
    expect(await res.text()).toBe('Method Not Allowed')
  })

  it('returns 400 if required fields are missing', async () => {
    const mockRetrieveFile = vi.fn()
    const req = withRequest(undefined, 'foo')
    const res = await worker.fetch(req, {}, {}, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Missing required fields')
  })

  it('returns the response from retrieveFile', async () => {
    const fakeResponse = new Response('hello', { status: 201, headers: { 'X-Test': 'yes' } })
    const mockRetrieveFile = vi.fn().mockResolvedValue(fakeResponse)
    const req = withRequest(2, 'bar')
    const res = await worker.fetch(req, {}, {}, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('hello')
    expect(res.headers.get('X-Test')).toBe('yes')
  })

  it('fetches the file from calibnet storage provider', async () => {
    const expectedHash = '61214c558a8470634437a941420a258c43ef1e89364d7347f02789f5a898dcb1'
    const pieceCid = 'baga6ea4seaqkzso6gijktpl22dxarxq25iynurceicxpst35yjrcp72uq3ziwpi'

    const req = withRequest(196, pieceCid)
    const res = await worker.fetch(req, {}, {}, { retrieveFile })

    expect(res.status).toBe(200)
    // get the sha256 hash of the content
    const content = await res.bytes()
    const hash = createHash('sha256').update(content).digest('hex')
    expect(hash).toEqual(expectedHash)
  })
})

/**
 *
 * @param {number} proofSetId
 * @param {string} pieceCid
 * @param {string} method
 *
 * @returns {Request}
 */
function withRequest (proofSetId, pieceCid, method = 'GET') {
  let url = 'http://worker.cloudflare.com'
  if (proofSetId) url += `/${proofSetId}`
  if (pieceCid) url += `/${pieceCid}`

  return new Request(url, { method })
}
