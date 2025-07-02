import { describe, it, beforeAll, expect } from 'vitest'
import { fetchAndStoreBadBits } from '../lib/badbits.js'
import { getAllBadBitHashes } from '../lib/store.js'
import { env } from 'cloudflare:test'
import { testData } from './testData.js'

describe('fetchAndStoreBadBits', () => {
  beforeAll(async () => {
    // Clear the database before running tests
    await env.DB.prepare('DELETE FROM badbits').run()
  })

  it('fetches and stores bad bits from the denylist', async () => {
    const text = testData
    const expectedHashes = new Set(
      text
        .split('\n')
        .filter((line) => line.startsWith('//'))
        .map((line) => line.substring(2).trim())
        .filter(Boolean),
    )

    const result = await fetchAndStoreBadBits(env, {
      fetchBadBits: () =>
        new Response(text, { headers: { 'Content-Type': 'text/plain' } }),
    })
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database contains the expected hashes
    expect(storedHashes).toEqual(expectedHashes)
    expect(result.added).toBe(expectedHashes.size)
    expect(result.removed).toBe(0)
  })

  it('removes hashes not in the current denylist', async () => {
    // Insert some initial hashes into the database
    const initialHashes = ['hash1', 'hash2', 'hash3']
    await env.DB.batch(
      initialHashes.map((hash) =>
        env.DB.prepare('INSERT INTO badbits (hash) VALUES (?)').bind(hash),
      ),
    )

    const text = testData
    const currentHashes = new Set(
      text
        .split('\n')
        .filter((line) => line.startsWith('//'))
        .map((line) => line.substring(2).trim())
        .filter(Boolean),
    )

    const result = await fetchAndStoreBadBits(env, {
      fetchBadBits: () =>
        new Response(text, { headers: { 'Content-Type': 'text/plain' } }),
    })
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database contains only the current hashes
    expect(result.added).toBe(currentHashes.size)
    expect(result.removed).toBe(initialHashes.length)
    expect(storedHashes).toEqual(currentHashes)
  })
  it(
    'successfully fetched bad bits from real denylist',
    { timeout: 20000 },
    async () => {
      const bits = await (
        await fetch('https://badbits.dwebops.pub/badbits.deny')
      ).text()

      const result = await fetchAndStoreBadBits(env, {
        fetchBadBits: () =>
          new Response(bits, { headers: { 'Content-Type': 'text/plain' } }),
      })

      // Wait a tick to flush finalizers and prevent Workerd crash
      await new Promise((resolve) => setTimeout(resolve, 100))

      const storedHashes = new Set(await getAllBadBitHashes(env))

      // Verify the database contains the expected hashes
      expect(storedHashes.size).toBe(result.added)
      expect(result.removed).toBe(0)
      expect(result.added).toBeGreaterThan(0)
    },
  )
})
