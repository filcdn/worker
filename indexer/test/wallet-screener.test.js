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
    // Not screened yet
    await withWalletDetails(env, {
      address: '0xabcd001',
      isSanctioned: false,
      lastScreenedAt: null,
    })
    // Screened a long time ago
    await withWalletDetails(env, {
      address: '0xabcd002',
      isSanctioned: false,
      lastScreenedAt: new Date('2025-01-01T00:00:00Z'),
    })
    // Screened recently
    await withWalletDetails(env, {
      address: '0xabcd003',
      isSanctioned: false,
      lastScreenedAt: new Date(),
    })

    await screenWallets(env, {
      staleThresholdMs: 60_000,
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
      isSanctioned ? 1 : 0,
      lastScreenedAt?.toISOString() ?? null,
    )
    .run()
}
