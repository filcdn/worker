import { describe, it, expect, vi, beforeEach } from 'vitest'
import { retrieveFile, getRetrievalUrl } from '../lib/retrieval.js'

describe('retrieveFile', () => {
  const baseUrl = 'https://example.com'
  const rootCid = 'bafy123abc'
  const defaultCacheTtl = 86400
  let fetchMock

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, headers: new Headers({}) })
    global.fetch = fetchMock
  })

  it('constructs the correct URL', async () => {
    await retrieveFile(baseUrl, rootCid)
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/piece/${rootCid}`,
      expect.any(Object),
    )
  })

  it('uses the default cacheTtl if not provided', async () => {
    await retrieveFile(baseUrl, rootCid)
    const options = fetchMock.mock.calls[0][1]
    expect(options.cf.cacheTtlByStatus['200-299']).toBe(defaultCacheTtl)
  })

  it('uses the provided cacheTtl', async () => {
    await retrieveFile(baseUrl, rootCid, 1234)
    const options = fetchMock.mock.calls[0][1]
    expect(options.cf.cacheTtlByStatus['200-299']).toBe(1234)
  })

  it('sets correct cacheTtlByStatus and cacheEverything', async () => {
    await retrieveFile(baseUrl, rootCid, 555)
    const options = fetchMock.mock.calls[0][1]
    expect(options.cf).toEqual({
      cacheTtlByStatus: {
        '200-299': 555,
        404: 0,
        '500-599': 0,
      },
      cacheEverything: true,
    })
  })

  it('returns the fetch response', async () => {
    const response = { ok: true, status: 200, headers: new Headers({}) }
    fetchMock.mockResolvedValueOnce(response)
    const result = await retrieveFile(baseUrl, rootCid)
    expect(result.response).toBe(response)
  })
})

describe('getRetrievalUrl', () => {
  it('appends the endpoint name and piece CID to the base URL', () => {
    const url = getRetrievalUrl('https://example.com', 'bafy123abc')
    expect(url).toBe('https://example.com/piece/bafy123abc')
  })

  it('avoids double slash in path when the base URL ends with a slash', () => {
    const url = getRetrievalUrl('https://example.com/', 'bafy123abc')
    expect(url).toBe('https://example.com/piece/bafy123abc')
  })
})
