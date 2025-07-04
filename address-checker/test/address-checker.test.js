import { describe, it, expect, vi, beforeEach } from 'vitest'
import scheduler from '../bin/address-checker.js'
import { env } from 'cloudflare:test'

describe('address-checker', () => {
  let mockFetch

  // Setup addresses for testing
  const sanctionedAddress = '0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a'
  const nonSanctionedAddress = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'

  // Mock execution environment with custom fetch
  const worker = {
    scheduled: async (controller, env, ctx, options = {}) => {
      return await scheduler.scheduled(controller, env, ctx, {
        fetch: options.fetch || global.fetch,
      })
    },
  }

  beforeEach(async () => {
    // Reset mocks
    vi.resetAllMocks()

    // Setup fetch mock
    mockFetch = vi.fn()

    // Clear the test database before each test
    await env.DB.prepare('DELETE FROM address_sanction_check').run()
    await env.DB.prepare('DELETE FROM indexer_proof_set_rails').run()

    // Setup some test data in indexer_proof_set_rails
    await env.DB.prepare(
      `
      INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn)
      VALUES 
        ('set1', 'rail1', '${sanctionedAddress}', '0xpayee1', true),
        ('set2', 'rail2', '0xpayer2', '${nonSanctionedAddress}', true),
        ('set3', 'rail3', '0xpayer3', '0xpayee3', true)
    `,
    ).run()
  })

  it('adds missing addresses from indexer_proof_set_rails to address_sanction_check', async () => {
    // Set up mockFetch to never actually be called for this test
    // as we're just testing the initial address discovery

    // Execute worker
    await worker.scheduled({}, env, {})

    // Verify addresses were added with 'pending' status
    const result = await env.DB.prepare(
      `
      SELECT address, status FROM address_sanction_check ORDER BY address
    `,
    ).all()

    // Should have addresses from the indexer_proof_set_rails table
    expect(result.results.length).toBeGreaterThan(0)

    // All addresses should have 'pending' status
    const allPending = result.results.every((row) => row.status === 'pending')
    expect(allPending).toBe(true)

    // Specifically verify our test addresses exist
    const addresses = result.results.map((row) => row.address)
    expect(addresses).toContain(sanctionedAddress.toLowerCase())
    expect(addresses).toContain(nonSanctionedAddress.toLowerCase())
  })

  it('checks pending addresses and updates their status', async () => {
    // Setup mock responses for the fetch calls to Chainalysis
    mockFetch.mockImplementation(async (url) => {
      // Extract the address from the URL
      const address = url.split('/').pop().toLowerCase()

      // Return appropriate response based on the address
      if (address === sanctionedAddress.toLowerCase()) {
        return {
          ok: true,
          json: async () => ({
            identifications: [
              {
                category: 'sanctions',
                name: 'SANCTIONS: Test Sanctioned Entity',
              },
            ],
          }),
        }
      } else {
        return {
          ok: true,
          json: async () => ({}), // Empty response for non-sanctioned address
        }
      }
    })

    // Execute worker with mocked fetch
    await worker.scheduled({}, env, {}, { fetch: mockFetch })

    // Verify the statuses were updated
    const result = await env.DB.prepare(
      `
      SELECT address, status FROM address_sanction_check
      WHERE address IN (?, ?)
      ORDER BY address
    `,
    )
      .bind(sanctionedAddress.toLowerCase(), nonSanctionedAddress.toLowerCase())
      .all()
    console.log('Result:', result)
    expect(result.results.length).toBe(2)

    // Check that the statuses are correct
    const sanctionedResult = result.results.find(
      (r) => r.address === sanctionedAddress.toLowerCase(),
    )
    const nonSanctionedResult = result.results.find(
      (r) => r.address === nonSanctionedAddress.toLowerCase(),
    )

    expect(sanctionedResult.status).toBe('sanctioned')
    expect(nonSanctionedResult.status).toBe('approved')

    // Verify fetch was called for each address
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenCalledWith(
      `https://public.chainalysis.com/api/v1/address/${sanctionedAddress.toLowerCase()}`,
      expect.any(Object),
    )
    expect(mockFetch).toHaveBeenCalledWith(
      `https://public.chainalysis.com/api/v1/address/${nonSanctionedAddress.toLowerCase()}`,
      expect.any(Object),
    )
  })

  it('handles errors in the Chainalysis API by keeping status as pending', async () => {
    // Add an address with pending status
    const testAddress = '0xTestAddress123456789012345678901234567890'
    await env.DB.prepare(
      `
      INSERT INTO address_sanction_check (address, status)
      VALUES ('${testAddress.toLowerCase()}', 'pending')
    `,
    ).run()

    // Setup mock to simulate API error
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    })

    // Execute worker
    await worker.scheduled({}, env, {}, { fetch: mockFetch })

    // Verify the status is still pending
    const result = await env.DB.prepare(
      `
      SELECT status FROM address_sanction_check
      WHERE address = ?
    `,
    )
      .bind(testAddress.toLowerCase())
      .first()

    // Check that result is not null before accessing status
    expect(result).not.toBeNull()
    expect(result.status).toBe('pending')
  })

  // Integration test with real API
  it.runIf(process.env.GITHUB_ACTIONS)(
    'correctly identifies sanctioned addresses using real API',
    async () => {
      // If we get here, we're in GitHub Actions CI
      console.log('Running real API test in GitHub CI environment')

      // Add our test addresses with pending status
      await env.DB.prepare(
        `
      INSERT INTO address_sanction_check (address, status)
      VALUES 
        ('${sanctionedAddress}', 'pending'),
        ('${nonSanctionedAddress}', 'pending')
    `,
      ).run()

      // Execute worker with the real fetch function (no mocking)
      await worker.scheduled({}, env, {})

      // Verify the statuses match our expectations
      const result = await env.DB.prepare(
        `
      SELECT address, status FROM address_sanction_check
      WHERE address IN (?, ?)
    `,
      )
        .bind(
          sanctionedAddress.toLowerCase(),
          nonSanctionedAddress.toLowerCase(),
        )
        .all()

      const sanctionedResult = result.results.find(
        (r) => r.address === sanctionedAddress.toLowerCase(),
      )
      const nonSanctionedResult = result.results.find(
        (r) => r.address === nonSanctionedAddress.toLowerCase(),
      )

      // The sanctioned address should be marked as sanctioned
      expect(sanctionedResult.status).toBe('sanctioned')

      // The non-sanctioned address should be approved (or pending if API had issues)
      expect(['approved', 'pending']).toContain(nonSanctionedResult.status)
    },
    { timeout: 10000 },
  ) // Increase timeout for real API call
})
