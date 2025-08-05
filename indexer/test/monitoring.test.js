import { describe, it, expect, vi } from 'vitest'
import workerImpl from '../bin/indexer.js'

describe('monitoring', () => {
  it('passes when everything is healthy', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('goldsky')
      expect(opts.method).toBe('POST')
      expect(opts.body).toMatch('hasIndexingErrors')
      expect(opts.body).toMatch('number')
      return new Response(
        JSON.stringify({
          data: {
            _meta: {
              hasIndexingErrors: false,
              block: {
                number: 100,
              },
            },
          },
        }),
      )
    })
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('chain.love')
      expect(opts.method).toBe('POST')
      expect(opts.body).toMatch('Filecoin.ChainHead')
      return new Response(
        JSON.stringify({
          result: {
            Height: 100,
          },
        }),
      )
    })
    await workerImpl.scheduled(null, null, null, { fetch: mockFetch })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
  it('fails when there is a goldsky indexing issue', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('goldsky')
      return new Response(
        JSON.stringify({
          data: {
            _meta: {
              hasIndexingErrors: true,
              block: {
                number: 100,
              },
            },
          },
        }),
      )
    })
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('chain.love')
      return new Response(
        JSON.stringify({
          result: {
            Height: 100,
          },
        }),
      )
    })
    await expect(
      workerImpl.scheduled(null, null, null, { fetch: mockFetch }),
    ).rejects.toThrow('Goldsky has indexing errors')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
  it('fails when goldsky is lagging behind', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('goldsky')
      return new Response(
        JSON.stringify({
          data: {
            _meta: {
              hasIndexingErrors: false,
              block: {
                number: 0,
              },
            },
          },
        }),
      )
    })
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('chain.love')
      return new Response(
        JSON.stringify({
          result: {
            Height: 100,
          },
        }),
      )
    })
    await expect(
      workerImpl.scheduled(null, null, null, { fetch: mockFetch }),
    ).rejects.toThrow('Goldsky is 100 blocks behind')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
  it('passes when goldsky is just 1 block behind', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('goldsky')
      return new Response(
        JSON.stringify({
          data: {
            _meta: {
              hasIndexingErrors: false,
              block: {
                number: 99,
              },
            },
          },
        }),
      )
    })
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('chain.love')
      return new Response(
        JSON.stringify({
          result: {
            Height: 100,
          },
        }),
      )
    })
    await workerImpl.scheduled(null, null, null, { fetch: mockFetch })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
  it('fails when 2 conditions trigger', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('goldsky')
      return new Response(
        JSON.stringify({
          data: {
            _meta: {
              hasIndexingErrors: true,
              block: {
                number: 0,
              },
            },
          },
        }),
      )
    })
    mockFetch.mockImplementationOnce((url, opts) => {
      expect(url).toMatch('chain.love')
      return new Response(
        JSON.stringify({
          result: {
            Height: 100,
          },
        }),
      )
    })
    await expect(
      workerImpl.scheduled(null, null, null, { fetch: mockFetch }),
    ).rejects.toThrow(
      'Goldsky has indexing errors & Goldsky is 100 blocks behind',
    )
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
