import { describe, it, expect, vi } from 'vitest'
import worker from '../bin/worker.js'
import { createHash } from 'node:crypto'
import { retrieveFile } from '../lib/retrieval.js'

describe('worker.fetch', () => {
  it('returns 405 for non-GET requests', async () => {
    const req = withRequest(1, 'foo', 'bar', 'POST')
    const res = await worker.fetch(req, {}, {})
    expect(res.status).toBe(405)
    expect(await res.text()).toBe('Method Not Allowed')
  })

  it('returns 400 if required fields are missing', async () => {
    const mockRetrieveFile = vi.fn()
    const req = withRequest(undefined, 'foo', 'bar')
    const res = await worker.fetch(req, {}, {}, { retrieveFile: mockRetrieveFile })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Missing required fields')
  })

  it('returns 200 and content if retrieveFile succeeds', async () => {
    const mockRetrieveFile = vi.fn()
    const fakeContent = new Uint8Array([1, 2, 3])
    const fakeResponse = {
      ok: true,
      arrayBuffer: vi.fn(() => Promise.resolve(fakeContent.buffer)),
      headers: new Headers({ 'Content-Type': 'application/test' })
    }
    mockRetrieveFile.mockResolvedValue(fakeResponse)

    const req = withRequest(1, 'foo', 'bar')
    const res = await worker.fetch(req, {}, {}, { retrieveFile: mockRetrieveFile })

    expect(res.status).toBe(200)
    expect(await res.arrayBuffer()).toEqual(fakeContent.buffer)
    expect(res.headers.get('Content-Type')).toBe('application/test')
  })

  it('returns 502 if retrieveFile throws', async () => {
    const mockRetrieveFile = vi.fn()
    mockRetrieveFile.mockRejectedValue(new Error('fail'))
    const req = withRequest(1, 'foo', 'bar')
    const res = await worker.fetch(req, {}, {}, { retrieveFile: mockRetrieveFile })

    expect(res.status).toBe(502)
    expect(await res.text()).toBe('Failed to fetch content')
  })

  it('returns 502 if retrieveFile returns non-ok response', async () => {
    const mockRetrieveFile = vi.fn()
    const fakeResponse = {
      ok: false,
      arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
      headers: new Headers()
    }
    mockRetrieveFile.mockResolvedValue(fakeResponse)

    const req = withRequest(1, 'foo', 'bar')
    const res = await worker.fetch(req, {}, {}, { retrieveFile: mockRetrieveFile })

    expect(res.status).toBe(502)
    expect(await res.text()).toBe('Failed to fetch content')
  })

  it('fetches the file from calibnet storage provider', async () => {
    const expectedHash = '61214c558a8470634437a941420a258c43ef1e89364d7347f02789f5a898dcb1'
    const pieceCid = 'baga6ea4seaqkzso6gijktpl22dxarxq25iynurceicxpst35yjrcp72uq3ziwpi'
    const baseUrl = 'yablu.net'

    const req = withRequest(196, baseUrl, pieceCid)
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
 * @param {string} baseUrl
 * @param {string} pieceCid
 * @param {string} method
 * @returns {string}
 */
function withRequest (proofSetId, baseUrl, pieceCid, method = 'GET') {
  const url = new URL('https://host/path')
  if (proofSetId) url.searchParams.set('proofSetId', proofSetId)
  if (baseUrl) url.searchParams.set('baseUrl', baseUrl)
  if (pieceCid) url.searchParams.set('pieceCid', pieceCid)
  return new Request(url, { method })
}
