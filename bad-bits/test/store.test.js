import { describe, it, beforeAll, expect } from 'vitest'
import { updateBadBitsDatabase } from '../lib/store.js'
import { env } from 'cloudflare:test'
import { getAllBadBitHashes } from './util.js'

describe('updateBadBitsDatabase', () => {
  beforeAll(async () => {
    // Clear the database before running tests
    await env.DB.prepare('DELETE FROM bad_bits').run()
  })

  it('adds new hashes to the database', async () => {
    const currentHashes = new Set(['hash1', 'hash2', 'hash3'])

    await updateBadBitsDatabase(env, currentHashes)
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database contains the new hashes
    expect(storedHashes).toEqual(currentHashes)
  })

  it('removes hashes not in the current set', async () => {
    // Insert some initial hashes into the database
    const initialHashes = ['hash1', 'hash2', 'hash3']
    const now = '2020-01-01T00:00:00.000Z'
    await env.DB.batch(
      initialHashes.map((hash) =>
        env.DB.prepare(
          'INSERT INTO bad_bits (hash, last_modified_at) VALUES (?, ?)',
        ).bind(hash, now),
      ),
    )

    const currentHashes = new Set(['hash2', 'hash4'])

    await updateBadBitsDatabase(env, currentHashes)
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database contains only the current hashes
    expect(storedHashes).toEqual(currentHashes)
    expect(storedHashes.has('hash1')).toBe(false)
    expect(storedHashes.has('hash3')).toBe(false)
    expect(storedHashes.has('hash2')).toBe(true)
    expect(storedHashes.has('hash4')).toBe(true)
  })

  it('does not modify the database if hashes are unchanged', async () => {
    const currentHashes = new Set(['hash1', 'hash2', 'hash3'])
    const now = '2020-01-01T00:00:00.000Z'

    // Insert the same hashes into the database
    await env.DB.batch(
      [...currentHashes].map((hash) =>
        env.DB.prepare(
          'INSERT INTO bad_bits (hash, last_modified_at) VALUES (?, ?)',
        ).bind(hash, now),
      ),
    )

    await updateBadBitsDatabase(env, currentHashes)
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database remains unchanged
    expect(storedHashes).toEqual(currentHashes)
  })
})
