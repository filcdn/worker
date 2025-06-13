import { describe, it, expect } from 'vitest'
import { parseRequest } from '../lib/request.js'

const DNS_ROOT = '.filcdn.io'
const TEST_WALLET = 'abc123'
const TEST_CID = 'baga123'

describe('parseRequest', () => {
  it('should parse clientWalletAddress and rootCid from a URL with both params', () => {
    const request = { url: `https://${TEST_WALLET}${DNS_ROOT}/${TEST_CID}` }
    const result = parseRequest(request, { DNS_ROOT })
    expect(result).toEqual({
      clientWalletAddress: TEST_WALLET,
      rootCid: TEST_CID,
    })
  })

  it('should parse clientWalletAddress and rootCid from a URL with leading slash', () => {
    const request = { url: `https://${TEST_WALLET}${DNS_ROOT}//${TEST_CID}` }
    const result = parseRequest(request, { DNS_ROOT })
    expect(result).toEqual({
      clientWalletAddress: TEST_WALLET,
      rootCid: TEST_CID,
    })
  })

  it('should return descriptive error for missing rootCid', () => {
    const request = { url: `https://${TEST_WALLET}${DNS_ROOT}/` }
    expect(() => parseRequest(request, { DNS_ROOT })).toThrowError(
      'Missing required path element: `/{CID}`',
    )
  })

  it('should return undefined for both if no params in path', () => {
    const request = { url: 'https://filcdn.io' }
    expect(() => parseRequest(request, { DNS_ROOT })).toThrowError(
      'Invalid hostname: filcdn.io. It must end with .filcdn.io.',
    )
  })

  it('should ignore query parameters', () => {
    const request = {
      url: `https://${TEST_WALLET}${DNS_ROOT}/${TEST_CID}?foo=bar`,
    }
    const result = parseRequest(request, { DNS_ROOT })
    expect(result).toEqual({
      clientWalletAddress: TEST_WALLET,
      rootCid: TEST_CID,
    })
  })
})
