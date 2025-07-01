import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { env } from 'cloudflare:test'
import {
  fetchAndStoreBadBits,
  checkCidAgainstBadBits,
  generateHashesForCid,
} from '../lib/badbits.js'
import workerImpl from '../bin/bad-bits.js'

// Sample denylist content for testing
const SAMPLE_DENYLIST = `
# Double-hash CID block using sha2-256 hashing
# base58btc-sha256-multihash(QmVTF1yEejXd9iMgoRTFDxBv7HAz9kuZcQNBzHrceuK9HR)
# Blocks bafybeidjwik6im54nrpfg7osdvmx7zojl5oaxqel5cmsz46iuelwf5acja
# and QmVTF1yEejXd9iMgoRTFDxBv7HAz9kuZcQNBzHrceuK9HR etc. by multihash
//QmX9dhRcQcKUw3Ws8485T5a9dtjrSCQaUAHnG4iK9i4ceM

# Legacy CID double-hash block
# sha256(bafybeiefwqslmf6zyyrxodaxx4vwqircuxpza5ri45ws3y5a62ypxti42e/)
//d9d295bde21f422d471a90f2a37ec53049fdf3e5fa3ee2e8f20e10003da429e7

# Legacy Path double-hash block
# Blocks bafybeiefwqslmf6zyyrxodaxx4vwqircuxpza5ri45ws3y5a62ypxti42e/path
//3f8b9febd851873b3774b937cce126910699ceac56e72e64b866f8e258d09572
`

// Known blocked CIDs
const BLOCKED_CID =
  'bafybeiefwqslmf6zyyrxodaxx4vwqircuxpza5ri45ws3y5a62ypxti42e'
const ALLOWED_CID =
  'bafybeihykld7uyxzogax6vgyvag42y7464eywpf55gxi5qpoisibh3c5wa'

describe('BadBits Worker', () => {
  let originalFetch

  beforeEach(async () => {
    // Store original fetch function
    originalFetch = global.fetch

    // Reset the database
    await env.DB.prepare('DELETE FROM badbits').run()
    await env.DB.prepare('DELETE FROM indexer_roots').run()

    // Add test CIDs to indexer_roots
    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid, status) VALUES (?, ?, ?, ?)',
    )
      .bind('test-root-1', 'test-set-1', BLOCKED_CID, 'unchecked')
      .run()

    await env.DB.prepare(
      'INSERT INTO indexer_roots (root_id, set_id, root_cid, status) VALUES (?, ?, ?, ?)',
    )
      .bind('test-root-2', 'test-set-1', ALLOWED_CID, 'unchecked')
      .run()
  })

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch
  })

  describe('fetchAndStoreBadBits', () => {
    it('fetches and stores badbits denylist', async () => {
      // Mock fetch to return our sample denylist
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_DENYLIST),
      })

      const result = await fetchAndStoreBadBits(env)

      // Should have added 3 entries
      expect(result.added).toBe(3)
      expect(result.removed).toBe(0)

      // Verify entries in database
      const { results } = await env.DB.prepare('SELECT * FROM badbits').all()
      expect(results.length).toBe(3)

      // Check specific hash
      const legacyHash = results.find(
        (r) =>
          r.hash ===
          'd9d295bde21f422d471a90f2a37ec53049fdf3e5fa3ee2e8f20e10003da429e7',
      )
      expect(legacyHash).toBeDefined()
      expect(legacyHash.hash_type).toBe('sha256')
    })

    it('updates existing entries and removes old ones', async () => {
      // First, add some initial entries
      await env.DB.prepare(
        'INSERT INTO badbits (hash, hash_type) VALUES (?, ?)',
      )
        .bind(
          'd9d295bde21f422d471a90f2a37ec53049fdf3e5fa3ee2e8f20e10003da429e7',
          'sha256',
        )
        .run()

      await env.DB.prepare(
        'INSERT INTO badbits (hash, hash_type) VALUES (?, ?)',
      )
        .bind('old-hash-to-remove', 'unknown')
        .run()

      // Mock fetch to return our sample denylist (without the old hash)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_DENYLIST),
      })

      const result = await fetchAndStoreBadBits(env)

      // Should have added 2 new entries and removed 1
      expect(result.added).toBe(2)
      expect(result.removed).toBe(1)

      // Verify entries in database
      const { results } = await env.DB.prepare('SELECT * FROM badbits').all()
      expect(results.length).toBe(3)

      // Old hash should be gone
      const oldHash = results.find((r) => r.hash === 'old-hash-to-remove')
      expect(oldHash).toBeUndefined()
    })
  })

  describe('checkCidAgainstBadBits', () => {
    beforeEach(async () => {
      // Add test entries to badbits table
      await env.DB.prepare(
        'INSERT INTO badbits (hash, hash_type) VALUES (?, ?)',
      )
        .bind(
          'd9d295bde21f422d471a90f2a37ec53049fdf3e5fa3ee2e8f20e10003da429e7',
          'sha256',
        )
        .run()
    })

    it('identifies blocked CIDs', async () => {
      const status = await checkCidAgainstBadBits(env, BLOCKED_CID)
      expect(status).toBe('blocked')

      // Verify the status was updated in the database
      const { status: dbStatus } = await env.DB.prepare(
        'SELECT status FROM indexer_roots WHERE root_cid = ?',
      )
        .bind(BLOCKED_CID)
        .first()

      expect(dbStatus).toBe('blocked')
    })

    it('identifies allowed CIDs', async () => {
      const status = await checkCidAgainstBadBits(env, ALLOWED_CID)
      expect(status).toBe('allowed')

      // Verify the status was updated in the database
      const { status: dbStatus } = await env.DB.prepare(
        'SELECT status FROM indexer_roots WHERE root_cid = ?',
      )
        .bind(ALLOWED_CID)
        .first()

      expect(dbStatus).toBe('allowed')
    })

    it('respects already known status', async () => {
      // Set a status manually
      await env.DB.prepare(
        'UPDATE indexer_roots SET status = ? WHERE root_cid = ?',
      )
        .bind('blocked', ALLOWED_CID)
        .run()

      // This should return the existing status without rechecking
      const status = await checkCidAgainstBadBits(env, ALLOWED_CID)
      expect(status).toBe('blocked')
    })
  })

  describe('generateHashesForCid', () => {
    it('generates correct hashes for a CID', () => {
      const hashes = generateHashesForCid(BLOCKED_CID)

      // Should have generated multiple hash formats
      expect(hashes.length).toBeGreaterThan(1)

      // Should include the legacy hash format that matches our test entry
      const legacyHash =
        'd9d295bde21f422d471a90f2a37ec53049fdf3e5fa3ee2e8f20e10003da429e7'
      expect(hashes).toContain(legacyHash)
    })
  })

  describe('HTTP API', () => {
    const worker = {
      fetch: async (request, env) => {
        const waitUntilCalls = []
        const ctx = {
          waitUntil: (promise) => {
            waitUntilCalls.push(promise)
          },
        }
        const response = await workerImpl.fetch(request, env, ctx)
        await Promise.all(waitUntilCalls)
        return response
      },
    }

    beforeEach(async () => {
      // Add test entries to badbits table
      await env.DB.prepare(
        'INSERT INTO badbits (hash, hash_type) VALUES (?, ?)',
      )
        .bind(
          'd9d295bde21f422d471a90f2a37ec53049fdf3e5fa3ee2e8f20e10003da429e7',
          'sha256',
        )
        .run()

      // Mock fetch for the refresh endpoint
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_DENYLIST),
      })

      // Set secret header value for testing
      env.SECRET_HEADER_VALUE = 'test-secret'
    })

    it('checks a CID via API', async () => {
      const req = new Request(`http://localhost/api/check/${BLOCKED_CID}`)
      const res = await worker.fetch(req, env)

      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.cid).toBe(BLOCKED_CID)
      expect(data.status).toBe('blocked')
    })

    it('returns 404 for unknown routes', async () => {
      const req = new Request('http://localhost/unknown')
      const res = await worker.fetch(req, env)

      expect(res.status).toBe(404)
    })

    it('refreshes denylist with proper authorization', async () => {
      const req = new Request('http://localhost/admin/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      })
      const res = await worker.fetch(req, env)

      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.added).toBe(2) // Should have added 2 new entries
    })

    it('rejects unauthorized refresh attempts', async () => {
      const req = new Request('http://localhost/admin/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
      })
      const res = await worker.fetch(req, env)

      expect(res.status).toBe(401)
    })
  })

  describe('Scheduled handler', () => {
    it('updates denylist when scheduled', async () => {
      // Mock fetch to return our sample denylist
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_DENYLIST),
      })

      const controller = {}
      const ctx = {
        waitUntil: vi.fn(),
      }

      await workerImpl.scheduled(controller, env, ctx)

      // Verify entries in database
      const { results } = await env.DB.prepare('SELECT * FROM badbits').all()
      expect(results.length).toBe(3)
    })
  })
})
