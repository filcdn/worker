import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchAndStoreBadBits } from '../lib/bad-bits.js'
import { getAllBadBitHashes, getBadBitsHistory } from './util.js'
import { env } from 'cloudflare:test'
import { testData } from './testData.js'

describe('fetchAndStoreBadBits', () => {
  beforeEach(async () => {
    // Clear the database before each test to avoid interference
    await env.DB.exec('DELETE FROM bad_bits')
    await env.DB.exec('DELETE FROM bad_bits_history')

    // tell vitest we use mocked time
    vi.useFakeTimers()
  })

  afterEach(() => {
    // restoring date after each test run
    vi.useRealTimers()
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
        ).bind(hash, '2000-01-01T00:00:00Z' /* time in the past */),
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

  it('uses ETag to detect when the bad bit list was not changed since the last check', async () => {
    const etag = 'bafybeig123'
    const lastUpdateAt = new Date('2020-01-01T00:00:00Z')
    vi.setSystemTime(lastUpdateAt)

    /** @type {Request} */
    let request
    await fetchAndStoreBadBits(env, {
      fetch: (req) => {
        request = req
        return new Response(testData, {
          headers: { 'Content-Type': 'text/plain', etag },
        })
      },
    })

    expect(
      request.headers?.get('If-None-Match'),
      'If-None-Match in the first request',
    ).toBe(null)

    // The history is updated when new bad bits are fetched
    expect(await getBadBitsHistory(env)).toStrictEqual([
      { timestamp: lastUpdateAt.toISOString(), etag },
    ])

    const now = new Date('2025-07-01T00:00:00Z')
    vi.setSystemTime(now)

    await fetchAndStoreBadBits(env, {
      fetch: (req) => {
        request = req
        return new Response(null, { status: 304 /* Not Modified */ })
      },
    })

    expect(
      request.headers?.get('If-None-Match'),
      'If-None-Match in the second request',
    ).toBe(etag)

    // The history should not be updated on 304 response
    expect(await getBadBitsHistory(env)).toStrictEqual([
      { timestamp: lastUpdateAt.toISOString(), etag },
    ])
  })

  it(
    'successfully fetched bad bits from real denylist',
    { timeout: 20000 },
    async () => {
      vi.useRealTimers()

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
