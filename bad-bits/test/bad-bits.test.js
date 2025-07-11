import { describe, it, beforeAll, expect } from 'vitest'
import { fetchAndStoreBadBits } from '../lib/bad-bits.js'
import { getAllBadBitHashes } from './util.js'
import { env } from 'cloudflare:test'
import { testData } from './testData.js'

describe('fetchAndStoreBadBits', () => {
  beforeAll(async () => {
    // Clear the database before running tests
    await env.DB.prepare('DELETE FROM bad_bits').run()
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

    await fetchAndStoreBadBits(env, {
      fetch: () =>
        new Response(text, { headers: { 'Content-Type': 'text/plain' } }),
    })
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database contains the expected hashes
    expect(storedHashes).toEqual(expectedHashes)
  })

  it('removes hashes not in the current denylist', async () => {
    // Insert some initial hashes into the database
    const initialHashes = ['hash1', 'hash2', 'hash3']
    await env.DB.batch(
      initialHashes.map((hash) =>
        env.DB.prepare(
          'INSERT INTO bad_bits (hash, last_modified_at) VALUES (?, ?)',
        ).bind(hash, new Date().toISOString()),
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

    await fetchAndStoreBadBits(env, {
      fetch: () =>
        new Response(text, { headers: { 'Content-Type': 'text/plain' } }),
    })
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database contains only the current hashes
    expect(storedHashes).toEqual(currentHashes)
  })
  it(
    'successfully fetched bad bits from real denylist',
    { timeout: 20000 },
    async () => {
      const bits = await (
        await fetch('https://badbits.dwebops.pub/badbits.deny')
      ).text()

      await fetchAndStoreBadBits(env, {
        fetch: () =>
          new Response(bits, { headers: { 'Content-Type': 'text/plain' } }),
      })

      // Wait a tick to flush finalizers and prevent Workerd crash
      await new Promise((resolve) => setTimeout(resolve, 100))

      const storedHashes = new Set(await getAllBadBitHashes(env))

      // Verify the database contains the expected hashes
      expect(storedHashes.size).toBeGreaterThan(0)

      // Choose a random hash from the real denylist file to verify it's in the database
      const { hash } = await env.DB.prepare(
        'SELECT hash FROM bad_bits WHERE hash = ?',
      )
        .bind(
          'f52158d2e286c09693117194c6ba34c5670aac484fc4631d2fa409897a5dfd38',
        )
        .first()
      expect(storedHashes).toContain(hash)
    },
  )
})
