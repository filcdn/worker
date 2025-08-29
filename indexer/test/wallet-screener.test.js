import { beforeEach, describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { assertCloseToNow } from './test-helpers.js'
import { screenWallets } from '../lib/wallet-screener.js'

describe('screenClientWallets', async () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM wallet_details').run()
  })

  it('handles empty list of wallets', async () => {
    await screenWallets(env, {
      staleThresholdMs: 1_000,
      batchSize: 10,
      checkIfAddressIsSanctioned: async (address) => true,
    })
    // the tests passed if the function call above did not throw
  })

  it('runs a screening check and updates the wallet details', async () => {
    const testAddress = '0x1234567890abcdef1234567890abcdef12345678'
    await withWalletDetails(env, {
      address: testAddress,
      isSanctioned: false,
      lastScreenedAt: new Date('2025-01-01T00:00:00Z'),
    })

    await screenWallets(env, {
      staleThresholdMs: 1_000,
      batchSize: 10,
      checkIfAddressIsSanctioned: async (address) => {
        expect(address).toBe(testAddress)
        return true // Simulate that the address is now sanctioned
      },
    })

    const details = await env.DB.prepare(
      'SELECT * FROM wallet_details WHERE address = ?',
    )
      .bind(testAddress)
      .first()
    expect(details.is_sanctioned, 'is_sanctioned').toStrictEqual(1)
    assertCloseToNow(details.last_screened_at)
  })

  it('screens `batchSize` addresses at once, choosing the most stale records', async () => {
    await withWalletDetails(env, {
      address: '0xabcd001',
      isSanctioned: false,
      lastScreenedAt: null,
    })
    await withWalletDetails(env, {
      address: '0xabcd002',
      isSanctioned: false,
      lastScreenedAt: new Date('2025-01-01T00:00:00Z'),
    })
    await withWalletDetails(env, {
      address: '0xabcd003',
      isSanctioned: false,
      lastScreenedAt: new Date('2025-06-01T00:00:00Z'),
    })

    await screenWallets(env, {
      staleThresholdMs: 1_000,
      batchSize: 2,
      checkIfAddressIsSanctioned: async (address) => true,
    })

    const { results } = await env.DB.prepare(
      'SELECT address, is_sanctioned FROM wallet_details ORDER BY address ASC',
    ).run()
    expect(results).toEqual([
      // The first two addressees were screened
      { address: '0xabcd001', is_sanctioned: 1 },
      { address: '0xabcd002', is_sanctioned: 1 },
      // The last address was not screened because of the batch size limit
      { address: '0xabcd003', is_sanctioned: 0 },
    ])
  })

  it('ignores addresses that we screened less than `staleThresholdMs` in the past', async () => {
    const staleThresholdMs = 2_000

    // Not screened yet
    await withWalletDetails(env, {
      address: '0xabcd001',
      isSanctioned: false,
      lastScreenedAt: null,
    })
    // Screened slightly more than staleThresholdMs ago
    await withWalletDetails(env, {
      address: '0xabcd002',
      isSanctioned: false,
      lastScreenedAt: new Date(Date.now() - staleThresholdMs - 200),
    })
    // Screened recently
    await withWalletDetails(env, {
      address: '0xabcd003',
      isSanctioned: false,
      lastScreenedAt: new Date(),
    })

    await screenWallets(env, {
      staleThresholdMs,
      batchSize: 10,
      checkIfAddressIsSanctioned: async (address) => true,
    })

    const { results } = await env.DB.prepare(
      'SELECT address, is_sanctioned FROM wallet_details ORDER BY address ASC',
    ).run()
    expect(results).toEqual([
      // The address with null `last_screened_at` was screened
      { address: '0xabcd001', is_sanctioned: 1 },
      // The address with old `last_screened_at` was screened
      { address: '0xabcd002', is_sanctioned: 1 },
      // The recently screened address was ignored
      { address: '0xabcd003', is_sanctioned: 0 },
    ])
  })

  it('continues processing the batch when some screening API calls fail', async () => {
    await withWalletDetails(env, {
      address: '0xabcd001',
      isSanctioned: 0,
      lastScreenedAt: new Date('2025-01-01T00:00:00Z'),
    })
    await withWalletDetails(env, {
      address: '0xabcd002',
      isSanctioned: 0,
      lastScreenedAt: new Date('2025-01-01T00:00:00Z'),
    })

    await screenWallets(env, {
      staleThresholdMs: 1_000,
      batchSize: 10,
      checkIfAddressIsSanctioned: async (address) => {
        if (address === '0xabcd001') throw new Error('Simulated API failure')
        return true // Simulate that the address is now sanctioned
      },
    })

    const { results: wallets } = await env.DB.prepare(
      'SELECT * FROM wallet_details ORDER BY address ASC',
    ).all()

    // The first wallet was not updated due to the simulated failure
    expect(wallets[0]).toEqual({
      address: '0xabcd001',
      is_sanctioned: 0,
      last_screened_at: '2025-01-01T00:00:00.000Z',
    })

    // The second wallet was screened successfully
    expect(wallets[1]).toMatchObject({
      address: '0xabcd002',
      is_sanctioned: 1,
    })
    assertCloseToNow(wallets[1].last_screened_at)
  })
})

/**
 * @param {Env} env
 * @param {object} props
 * @param {string} props.address
 * @param {boolean} props.isSanctioned
 * @param {Date | null} props.lastScreenedAt
 * @returns {Promise<void>}
 */
export async function withWalletDetails(
  env,
  { address, isSanctioned, lastScreenedAt },
) {
  await env.DB.prepare(
    `
    INSERT INTO wallet_details (address, is_sanctioned, last_screened_at)
    VALUES (?, ?, ?)
  `,
  )
    .bind(
      address.toLowerCase(),
      isSanctioned,
      lastScreenedAt?.toISOString() ?? null,
    )
    .run()
}
