import { describe, it, vi, expect } from 'vitest'
import assert from 'node:assert/strict'
import {
  calculateProviderRSRScores,
  updateProviderRSRScores,
} from '../lib/lib.js'
import { env } from 'cloudflare:test'

vi.mock('../lib/store.js', () => {
  return {
    storeProviderRSRScores: vi.fn(),
  }
})

describe('Provider RSR Scores', () => {
  describe('calculateProviderRSRScores', () => {
    it('calculates RSR scores correctly from retrieval logs', async () => {
      const nowTimestamp = new Date().toISOString()
      await env.DB.batch([
        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client1', 200, 1000, true, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client2', 200, 1500, true, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client3', 200, 2000, true, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client4', 404, 0, true, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client5', 200, 2500, true, 'ps2'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider2', 'client1', 200, 3000, true, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider2', 'client2', 500, 0, true, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider3', 'client1', 404, 0, true, 'ps3'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider3', 'client2', 500, 0, true, 'ps3'),
      ])

      const scores = await calculateProviderRSRScores(env)
      console.log('Calculated scores:', scores)

      const provider1ScorePs1 = scores.find(
        (s) => s.address === 'provider1' && s.proof_set_id === 'ps1',
      )
      const provider1ScorePs2 = scores.find(
        (s) => s.address === 'provider1' && s.proof_set_id === 'ps2',
      )
      const provider2ScorePs1 = scores.find(
        (s) => s.address === 'provider2' && s.proof_set_id === 'ps1',
      )
      const provider3ScorePs3 = scores.find(
        (s) => s.address === 'provider3' && s.proof_set_id === 'ps3',
      )

      assert.ok(provider1ScorePs1, 'Provider1 score for ps1 should exist')
      assert.ok(provider1ScorePs2, 'Provider1 score for ps2 should exist')
      assert.ok(provider2ScorePs1, 'Provider2 score for ps1 should exist')
      assert.ok(provider3ScorePs3, 'Provider3 score for ps3 should exist')

      assert.strictEqual(
        provider1ScorePs1.rsr,
        75,
        'Provider1 should have 75% RSR for ps1',
      )
      assert.strictEqual(
        provider1ScorePs2.rsr,
        100,
        'Provider1 should have 100% RSR for ps2',
      )
      assert.strictEqual(
        provider2ScorePs1.rsr,
        50,
        'Provider2 should have 50% RSR for ps1',
      )
      assert.strictEqual(
        provider3ScorePs3.rsr,
        0,
        'Provider3 should have 0% RSR for ps3',
      )

      assert.ok(provider1ScorePs1.calculated_at, 'Should have timestamp')
      assert.strictEqual(
        provider1ScorePs1.calculated_at,
        provider1ScorePs2.calculated_at,
        'Timestamps should match',
      )
    })

    it('ignores cache hits when calculating RSR', async () => {
      const nowTimestamp = new Date().toISOString()
      await env.DB.batch([
        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client1', 200, 1000, true, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client2', 404, 0, true, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client3', 200, 1000, false, 'ps1'),

        env.DB.prepare(
          `
          INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        ).bind(nowTimestamp, 'provider1', 'client4', 404, 0, false, 'ps1'),
      ])

      const scores = await calculateProviderRSRScores(env)
      const provider1Score = scores.find(
        (s) => s.address === 'provider1' && s.proof_set_id === 'ps1',
      )

      assert.strictEqual(
        provider1Score.rsr,
        50,
        'Provider1 should have 50% RSR (cache hits ignored)',
      )
    })
    it('correctly separates scores by proof set when a provider serves multiple proof sets', async () => {
      const nowTimestamp = new Date().toISOString()

      // Set up a provider with different success rates for different proof sets
      await env.DB.batch([
        // Provider4: 2/3 successful (66%) for proof_set_id "ps4"
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider4', 'client1', 200, 1000, true, 'ps4'),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider4', 'client2', 200, 1500, true, 'ps4'),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider4', 'client3', 404, 0, true, 'ps4'),

        // Provider4: 3/5 successful (60%) for proof_set_id "ps5"
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider4', 'client4', 200, 2000, true, 'ps5'),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider4', 'client5', 200, 2500, true, 'ps5'),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider4', 'client6', 200, 3000, true, 'ps5'),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider4', 'client7', 404, 0, true, 'ps5'),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider4', 'client8', 500, 0, true, 'ps5'),
      ])

      // Calculate RSR scores
      const scores = await calculateProviderRSRScores(env)

      // Find the scores for provider4 by proof set
      const provider4ScorePs4 = scores.find(
        (s) => s.address === 'provider4' && s.proof_set_id === 'ps4',
      )
      const provider4ScorePs5 = scores.find(
        (s) => s.address === 'provider4' && s.proof_set_id === 'ps5',
      )

      // Assert the scores exist
      assert.ok(provider4ScorePs4, 'Provider4 score for ps4 should exist')
      assert.ok(provider4ScorePs5, 'Provider4 score for ps5 should exist')

      // Assert the scores are correct
      assert.strictEqual(
        provider4ScorePs4.rsr,
        66,
        'Provider4 should have 66% RSR for ps4',
      )
      assert.strictEqual(
        provider4ScorePs5.rsr,
        60,
        'Provider4 should have 60% RSR for ps5',
      )
    })

    it('handles null proof set IDs correctly', async () => {
      const nowTimestamp = new Date().toISOString()

      await env.DB.batch([
        // Provider5: 2/3 successful (66%) for null proof_set_id
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider5', 'client1', 200, 1000, true, null),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider5', 'client2', 200, 1500, true, null),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider5', 'client3', 404, 0, true, null),

        // Provider5: 1/1 successful (100%) for proof_set_id "ps6"
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider5', 'client4', 200, 2000, true, 'ps6'),
      ])

      // Calculate RSR scores
      const scores = await calculateProviderRSRScores(env)

      // Find the scores for provider5 by proof set
      const provider5ScoreNull = scores.find(
        (s) => s.address === 'provider5' && s.proof_set_id === null,
      )
      const provider5ScorePs6 = scores.find(
        (s) => s.address === 'provider5' && s.proof_set_id === 'ps6',
      )

      // Assert the scores exist
      assert.ok(
        provider5ScoreNull,
        'Provider5 score for null proof_set_id should exist',
      )
      assert.ok(provider5ScorePs6, 'Provider5 score for ps6 should exist')

      // Assert the scores are correct
      assert.strictEqual(
        provider5ScoreNull.rsr,
        66,
        'Provider5 should have 66% RSR for null proof_set_id',
      )
      assert.strictEqual(
        provider5ScorePs6.rsr,
        100,
        'Provider5 should have 100% RSR for ps6',
      )
    })

    it('correctly calculates scores when providers share the same proof set', async () => {
      const nowTimestamp = new Date().toISOString()

      await env.DB.batch([
        // Provider6: 2/2 successful (100%) for proof_set_id "shared_ps"
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          nowTimestamp,
          'provider6',
          'client1',
          200,
          1000,
          true,
          'shared_ps',
        ),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          nowTimestamp,
          'provider6',
          'client2',
          200,
          1500,
          true,
          'shared_ps',
        ),

        // Provider7: 1/2 successful (50%) for the same proof_set_id "shared_ps"
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          nowTimestamp,
          'provider7',
          'client3',
          200,
          2000,
          true,
          'shared_ps',
        ),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider7', 'client4', 404, 0, true, 'shared_ps'),
      ])

      // Calculate RSR scores
      const scores = await calculateProviderRSRScores(env)

      // Find the scores for both providers for the shared proof set
      const provider6Score = scores.find(
        (s) => s.address === 'provider6' && s.proof_set_id === 'shared_ps',
      )
      const provider7Score = scores.find(
        (s) => s.address === 'provider7' && s.proof_set_id === 'shared_ps',
      )

      // Assert the scores exist
      assert.ok(provider6Score, 'Provider6 score for shared_ps should exist')
      assert.ok(provider7Score, 'Provider7 score for shared_ps should exist')

      // Assert the scores are correct
      assert.strictEqual(
        provider6Score.rsr,
        100,
        'Provider6 should have 100% RSR for shared_ps',
      )
      assert.strictEqual(
        provider7Score.rsr,
        50,
        'Provider7 should have 50% RSR for shared_ps',
      )
    })

    it('handles historical data correctly when calculating scores for a specific time period', async () => {
      // Create timestamps for different time periods
      const oldTimestamp = new Date()
      oldTimestamp.setDate(oldTimestamp.getDate() - 7) // 7 days ago

      const middleTimestamp = new Date()
      middleTimestamp.setDate(middleTimestamp.getDate() - 3) // 3 days ago

      const recentTimestamp = new Date().toISOString() // now

      // Insert a previous score with timestamp
      await env.DB.prepare(
        'INSERT INTO provider_scores (address, proof_set_id, rsr, calculated_at) VALUES (?, ?, ?, ?)',
      )
        .bind('provider8', 'ps8', 60, middleTimestamp.toISOString())
        .run()

      await env.DB.batch([
        // Old logs (before last calculation, should be ignored)
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          oldTimestamp.toISOString(),
          'provider8',
          'client1',
          404,
          0,
          true,
          'ps8',
        ),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          oldTimestamp.toISOString(),
          'provider8',
          'client2',
          404,
          0,
          true,
          'ps8',
        ),

        // Recent logs (after last calculation, should be included)
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(recentTimestamp, 'provider8', 'client3', 200, 1000, true, 'ps8'),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(recentTimestamp, 'provider8', 'client4', 200, 1500, true, 'ps8'),
      ])

      // Calculate RSR scores
      const scores = await calculateProviderRSRScores(env)

      // Find the score for provider8
      const provider8Score = scores.find(
        (s) => s.address === 'provider8' && s.proof_set_id === 'ps8',
      )

      // Assert the score exists
      assert.ok(provider8Score, 'Provider8 score for ps8 should exist')

      // Assert the score is correct - only considering logs after the last calculation
      assert.strictEqual(
        provider8Score.rsr,
        100,
        'Provider8 should have 100% RSR for ps8 (only post-calculation logs counted)',
      )
    })
  })

  describe('updateProviderRSRScores', () => {
    it('calculates scores and stores them with proof set IDs', async () => {
      // Setup retrieval logs with proof set IDs
      const nowTimestamp = new Date().toISOString()
      await env.DB.batch([
        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          nowTimestamp,
          'provider1',
          'client1',
          200,
          1000,
          true,
          'test_ps_1',
        ),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(nowTimestamp, 'provider1', 'client2', 404, 0, true, 'test_ps_1'),

        env.DB.prepare(
          `
            INSERT INTO retrieval_logs (timestamp, owner_address, client_address, response_status, egress_bytes, cache_miss, proof_set_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).bind(
          nowTimestamp,
          'provider1',
          'client3',
          200,
          2000,
          true,
          'test_ps_2',
        ),
      ])

      // Call the update function
      await updateProviderRSRScores(env)

      const { results } = await env.DB.prepare(
        'SELECT address, proof_set_id, rsr FROM provider_scores WHERE address = ?',
      )
        .bind('provider1')
        .all()
      expect(results.length).toBe(2)
      expect(results[0].proof_set_id).toBe('test_ps_1')
      expect(results[0].rsr).toBe(50) // 1 success out of 2 attempts
      expect(results[1].proof_set_id).toBe('test_ps_2')
      expect(results[1].rsr).toBe(100) // 1 success out of 1 attempt
    })
  })
})
