import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAddressSanctioned } from '../lib/chainalysis.js'

describe('isAddressSanctioned', () => {
  const apiKey = 'test-api-key'
  let mockFetch

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()

    // Setup fetch mock
    mockFetch = vi.fn()
  })

  it('makes correct API call', async () => {
    // Setup
    const address = '0x1111111111111111111111111111111111111111'

    // Mock successful responses
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ identifications: [] }),
    })

    // Execute
    const result = await isAddressSanctioned(apiKey, address, {
      fetch: mockFetch,
    })

    // Verify
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://public.chainalysis.com/api/v1/address/0x1111111111111111111111111111111111111111',
      {
        headers: {
          'X-API-KEY': apiKey,
          Accept: 'application/json',
        },
      },
    )
    expect(result).toEqual(false) // Assuming the address is not sanctioned
  })

  it('correctly identifies sanctioned addresses', async () => {
    const sanctionedAddress = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'

    // Mock response for sanctioned address
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          identifications: [
            {
              category: 'sanctions',
              name: 'SANCTIONS: Test Sanctioned Entity',
            },
          ],
        }),
    })

    // Execute
    const result = await isAddressSanctioned(apiKey, sanctionedAddress, {
      fetch: mockFetch,
    })

    // Verify
    expect(result).toEqual(true)
  })

  it('returns null on API errors', async () => {
    const address = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'

    // Mock error response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    })

    // Execute
    const result = await isAddressSanctioned(apiKey, address, {
      fetch: mockFetch,
    })

    // Verify
    expect(result).toBeNull()
  })

  it('returns null on exception', async () => {
    const address = ['0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC']

    // Mock fetch throwing an exception
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    // Execute
    const result = await isAddressSanctioned(address, apiKey, {
      fetch: mockFetch,
    })

    // Verify
    expect(result).toBeNull()
  })
})
