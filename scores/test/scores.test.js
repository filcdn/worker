import { describe, it, beforeEach, vi } from 'vitest'
import assert from 'node:assert/strict'
import {
  calculateProviderRSRScores,
  updateProviderRSRScores,
} from '../lib/lib.js'
import { storeProviderRSRScores } from '../lib/store.js'
import { env } from 'cloudflare:test'

// Mock storeProviderRSRScores to avoid depending on its implementation
vi.mock('../lib/store.js', () => {
  return {
    storeProviderRSRScores: vi.fn(),
  }
})

describe('Provider RSR Scores', () => {
  describe('calculateProviderRSRScores', () => {
    it('calculates RSR scores correctly from retrieval logs', async () => {
      // Insert test retrieval logs
      const nowTimestamp = new Date().toISOString()
      await env.DB.batch([
        // Provider1: 3/4 successful (75%)
        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client1', 200, 1000, true),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client2', 200, 1500, true),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client3', 200, 2000, true),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client4', 404, 0, true),

        // Provider2: 1/2 successful (50%)
        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider2', 'client1', 200, 3000, true),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider2', 'client2', 500, 0, true),

        // Provider3: 0/2 successful (0%)
        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider3', 'client1', 404, 0, true),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider3', 'client2', 500, 0, true),
      ])

      // Calculate RSR scores
      const scores = await calculateProviderRSRScores(env)
      console.log('Calculated scores:', scores)
      // Check scores are calculated correctly
      const provider1Score = scores.find((s) => s.address === 'provider1')
      const provider2Score = scores.find((s) => s.address === 'provider2')
      const provider3Score = scores.find((s) => s.address === 'provider3')

      assert.ok(provider1Score, 'Provider1 score should exist')
      assert.ok(provider2Score, 'Provider2 score should exist')
      assert.ok(provider3Score, 'Provider3 score should exist')

      assert.strictEqual(
        provider1Score.rsr,
        75,
        'Provider1 should have 75% RSR',
      )
      assert.strictEqual(
        provider2Score.rsr,
        50,
        'Provider2 should have 50% RSR',
      )
      assert.strictEqual(provider3Score.rsr, 0, 'Provider3 should have 0% RSR')

      // Check timestamps
      assert.ok(provider1Score.calculated_at, 'Should have timestamp')
      assert.strictEqual(
        provider1Score.calculated_at,
        provider2Score.calculated_at,
        'Timestamps should match',
      )
    })

    it('ignores cache hits when calculating RSR', async () => {
      const nowTimestamp = new Date().toISOString()
      await env.DB.batch([
        // Cache miss (should count): 1/2 successful (50%)
        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client1', 200, 1000, true),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client2', 404, 0, true),

        // Cache hits (should not count)
        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client3', 200, 1000, false),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client4', 404, 0, false),
      ])

      const scores = await calculateProviderRSRScores(env)
      const provider1Score = scores.find((s) => s.address === 'provider1')

      assert.strictEqual(
        provider1Score.rsr,
        50,
        'Provider1 should have 50% RSR (cache hits ignored)',
      )
    })

    it('only considers logs after the most recent calculation timestamp', async () => {
      // Insert a previous score with timestamp
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 7) // 7 days ago
      const pastTimestamp = pastDate.toISOString()

      await env.DB.prepare(
        'INSERT INTO provider_scores (address, rsr, calculated_at) VALUES (?, ?, ?)',
      )
        .bind('provider1', 60, pastTimestamp)
        .run()

      // Insert logs before and after the timestamp
      const beforeTimestamp = new Date(pastDate)
      beforeTimestamp.setDate(beforeTimestamp.getDate() - 1) // 8 days ago

      const afterTimestamp = new Date(pastDate)
      afterTimestamp.setDate(afterTimestamp.getDate() + 1) // 6 days ago

      // Before last calculation (should be ignored): 0% success
      await env.DB.prepare(
        `
        INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
        .bind(
          beforeTimestamp.toISOString(),
          'provider1',
          'client1',
          404,
          0,
          true,
        )
        .run()

      await env.DB.prepare(
        `
        INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
        .bind(
          beforeTimestamp.toISOString(),
          'provider1',
          'client2',
          500,
          0,
          true,
        )
        .run()

      // After last calculation (should be included): 100% success
      await env.DB.prepare(
        `
        INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
        .bind(
          afterTimestamp.toISOString(),
          'provider1',
          'client3',
          200,
          1000,
          true,
        )
        .run()

      await env.DB.prepare(
        `
        INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
        .bind(
          afterTimestamp.toISOString(),
          'provider1',
          'client4',
          200,
          2000,
          true,
        )
        .run()

      const scores = await calculateProviderRSRScores(env)
      const provider1Score = scores.find((s) => s.address === 'provider1')

      assert.strictEqual(
        provider1Score.rsr,
        100,
        'Provider1 should have 100% RSR (only post-calculation logs counted)',
      )
    })
  })

  describe('updateProviderRSRScores', () => {
    it('calculates scores and stores them', async () => {
      // Setup retrieval logs
      const nowTimestamp = new Date().toISOString()
      await env.DB.batch([
        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client1', 200, 1000, true),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client2', 404, 0, true),
      ])

      // Call the update function
      await updateProviderRSRScores(env)

      // Verify scores were calculated and stored
      const result = await env.DB.prepare(
        'SELECT address, rsr, calculated_at FROM provider_scores WHERE address = ?',
      )
        .bind('provider1')
        .first()

      assert.strictEqual(result.address, 'provider1', 'Address should match')
      assert.strictEqual(result.rsr, 50, 'Provider1 should have 50% RSR')
      assert.ok(result.calculated_at, 'Should have a calculation timestamp')
    })

    it('passes empty array to store function when no scores calculated', async () => {
      // No retrieval logs, should return empty array
      await updateProviderRSRScores(env)
      const { results } = await env.DB.prepare(
        'SELECT address, rsr, calculated_at FROM provider_scores WHERE address = ?',
      )
        .bind('provider1')
        .all()
      assert.strictEqual(
        results.length,
        0,
        'Should return empty array when no scores calculated',
      )
    })

    it('handles errors in calculation', async () => {
      // Force an error by making the table non-existent
      await env.DB.exec('DROP TABLE IF EXISTS retrieval_logs')

      // Should throw an error
      await assert.rejects(
        async () => await updateProviderRSRScores(env),
        /Failed to calculate provider RSR scores/,
        'Should throw error when calculation fails',
      )

      // Store function should not be called
      assert.strictEqual(
        storeProviderRSRScores.mock.calls.length,
        0,
        'storeProviderRSRScores should not be called on error',
      )
    })
  })
})
