import { describe, it, beforeAll, expect } from 'vitest'
import { updateBadBitsDatabase, getAllBadBitHashes } from '../lib/store.js'
import { env } from 'cloudflare:test'

describe('updateBadBitsDatabase', () => {
  beforeAll(async () => {
    // Clear the database before running tests
    await env.DB.prepare('DELETE FROM badbits').run()
  })

  it('adds new hashes to the database', async () => {
    const currentHashes = new Set(['hash1', 'hash2', 'hash3'])

    const result = await updateBadBitsDatabase(env, currentHashes)
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database contains the new hashes
    expect(storedHashes).toEqual(currentHashes)
    expect(result.added).toBe(currentHashes.size)
    expect(result.removed).toBe(0)
  })

  it('removes hashes not in the current set', async () => {
    // Insert some initial hashes into the database
    const initialHashes = ['hash1', 'hash2', 'hash3']
    await env.DB.batch(
      initialHashes.map((hash) =>
        env.DB.prepare('INSERT INTO badbits (hash) VALUES (?)').bind(hash),
      ),
    )

    const currentHashes = new Set(['hash2', 'hash4'])

    const result = await updateBadBitsDatabase(env, currentHashes)
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database contains only the current hashes
    expect(storedHashes).toEqual(currentHashes)
    expect(result.added).toBe(1) // 'hash4' added
    expect(result.removed).toBe(2) // 'hash1' and 'hash3' removed
    expect(storedHashes.has('hash1')).toBe(false)
    expect(storedHashes.has('hash3')).toBe(false)
    expect(storedHashes.has('hash2')).toBe(true)
    expect(storedHashes.has('hash4')).toBe(true)
  })

  it('does not modify the database if hashes are unchanged', async () => {
    const currentHashes = new Set(['hash1', 'hash2', 'hash3'])

    // Insert the same hashes into the database
    await env.DB.batch(
      [...currentHashes].map((hash) =>
        env.DB.prepare('INSERT INTO badbits (hash) VALUES (?)').bind(hash),
      ),
    )

    const result = await updateBadBitsDatabase(env, currentHashes)
    const storedHashes = new Set(await getAllBadBitHashes(env))

    // Verify the database remains unchanged
    expect(storedHashes).toEqual(currentHashes)
    expect(result.added).toBe(0)
    expect(result.removed).toBe(0)
  })
})
