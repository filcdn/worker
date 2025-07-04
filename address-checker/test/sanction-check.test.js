import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAddresses } from '../lib/sanction-check.js'
import { isValidEthereumAddress } from '../../retriever/lib/address.js'


describe('checkAddresses', () => {
  const apiKey = 'test-api-key'
  let mockFetch

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()
    
    // Setup fetch mock
    mockFetch = vi.fn()
  })

  it('returns empty array when no valid addresses are provided', async () => {    
    // Execute
    const result = await checkAddresses(['invalid1', 'invalid2'], apiKey, { fetch: mockFetch })
    
    // Verify
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('makes correct API call for each address', async () => {
    // Setup
    const addresses = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222'
    ]
    
    // Mock successful responses
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    })
    
    // Execute
    await checkAddresses(addresses, apiKey, { fetch: mockFetch })
    
    // Verify
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://public.chainalysis.com/api/v1/address/0x1111111111111111111111111111111111111111',
      {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      }
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://public.chainalysis.com/api/v1/address/0x2222222222222222222222222222222222222222',
      {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json'
        }
      }
    )
  })

  it('correctly identifies sanctioned addresses', async () => {
    const addresses = ['0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC', '0x5A13b7df87f59A291C26A2A1d684AD03Ce9B68DC']
    
    // Mock response for sanctioned address
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        identifications: [
          {
            category: 'sanctions',
            name: 'SANCTIONS: Test Sanctioned Entity'
          }
        ]
      })
    })
    
    // Mock response for approved address
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    })
    
    // Execute
    const results = await checkAddresses(addresses, apiKey, { fetch: mockFetch })
    
    // Verify
    expect(results).toEqual([
      { address: addresses[0], status: 'sanctioned' },
      { address: addresses[1], status: 'approved' }
    ])
  })

  it('handles API errors by marking address as pending', async () => {
    const address = ['0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC']
    
    // Mock error response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    })
    
    // Execute
    const results = await checkAddresses(address, apiKey, { fetch: mockFetch })
    
    // Verify
    expect(results).toEqual([
      { address: address[0], status: 'pending' }
    ])
  })

  it('handles exceptions by marking address as pending', async () => {
    const address = ['0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC']
    
    // Mock fetch throwing an exception
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    
    // Execute
    const results = await checkAddresses(address, apiKey, { fetch: mockFetch })
    
    // Verify
    expect(results).toEqual([
      { address: address[0], status: 'pending' }
    ])
  })

  it('correctly processes mixed result types', async () => {
    const addresses = [
      '0x5A13b7df87f59A291C26A2A1d684AD03Ce9B68DC', 
      '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC', 
      '0x5A33b7df87f59A291C26A2A1d684AD03Ce9B68DC', 
      '0x5A43b7df87f59A291C26A2A1d684AD03Ce9B68DC'
    ]
    
    // Mock responses
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        identifications: [{ category: 'sanctions' }]
      })
    }) // sanctioned
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    }) // approved
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    }) // error
    
    mockFetch.mockRejectedValueOnce(new Error('Network error')) // exception
    
    // Execute
    const results = await checkAddresses(addresses, apiKey, { fetch: mockFetch })
    
    // Verify
    expect(results).toEqual([
      { address: addresses[0], status: 'sanctioned' },
      { address: addresses[1], status: 'approved' },
      { address: addresses[2], status: 'pending' },
      { address: addresses[3], status: 'pending' }
    ])
  })
})