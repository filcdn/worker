import { describe, it, expect } from 'vitest'
import { parseRequest } from '../lib/request.js'

describe('parseRequest', () => {
  it('should parse proofSetId and pieceCid from a URL with both params', () => {
    const request = { url: 'https://example.com/abc123/def456' }
    const result = parseRequest(request)
    expect(result).toEqual({ proofSetId: 'abc123', pieceCid: 'def456' })
  })

  it('should parse proofSetId and pieceCid from a URL with leading slash', () => {
    const request = { url: 'https://example.com//abc123/def456' }
    const result = parseRequest(request)
    expect(result).toEqual({ proofSetId: 'abc123', pieceCid: 'def456' })
  })

  it('should return undefined for missing pieceCid', () => {
    const request = { url: 'https://example.com/abc123' }
    const result = parseRequest(request)
    expect(result).toEqual({ proofSetId: 'abc123', pieceCid: undefined })
  })

  it('should return undefined for both if no params in path', () => {
    const request = { url: 'https://example.com/' }
    const result = parseRequest(request)
    expect(result).toEqual({ proofSetId: undefined, pieceCid: undefined })
  })

  it('should ignore query parameters', () => {
    const request = { url: 'https://example.com/abc123/def456?foo=bar' }
    const result = parseRequest(request)
    expect(result).toEqual({ proofSetId: 'abc123', pieceCid: 'def456' })
  })
})
