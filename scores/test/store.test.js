import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { storeProviderRSRScores } from '../lib/store.js'
import { env } from 'cloudflare:test'

describe('storeProviderRSRScores', () => {
  it('inserts new provider scores correctly', async () => {
    const timestamp = new Date().toISOString()
    const testScores = [
      { address: 'provider1', rsr: 85, calculated_at: timestamp },
      { address: 'provider2', rsr: 92, calculated_at: timestamp },
    ]

    await storeProviderRSRScores(env, testScores)

    const results = await env.DB.prepare(
      'SELECT address, rsr FROM provider_scores ORDER BY address',
    ).all()

    assert.deepStrictEqual(results.results, [
      { address: 'provider1', rsr: 85 },
      { address: 'provider2', rsr: 92 },
    ])
  })

  it('supports storing multiple timestamps for the same provider', async () => {
    // Generate two different timestamps
    const timestamp1 = new Date()
    timestamp1.setDate(timestamp1.getDate() - 1)
    const timestamp1Str = timestamp1.toISOString()

    const timestamp2 = new Date().toISOString()

    // First insert with older timestamp
    await storeProviderRSRScores(env, [
      {
        address: 'time-series-provider',
        rsr: 75,
        calculated_at: timestamp1Str,
      },
    ])

    // Then insert with newer timestamp
    await storeProviderRSRScores(env, [
      { address: 'time-series-provider', rsr: 80, calculated_at: timestamp2 },
    ])

    // Check that both records exist (since we have compound primary key)
    const results = await env.DB.prepare(
      'SELECT address, rsr, calculated_at FROM provider_scores WHERE address = ? ORDER BY calculated_at',
    )
      .bind('time-series-provider')
      .all()

    assert.strictEqual(
      results.results.length,
      2,
      'Should have two records for different timestamps',
    )
    assert.strictEqual(
      results.results[0].rsr,
      75,
      'First record should have RSR of 75',
    )
    assert.strictEqual(
      results.results[1].rsr,
      80,
      'Second record should have RSR of 80',
    )
  })

  it('updates existing provider scores for the same timestamp', async () => {
    const timestamp = new Date().toISOString()

    // First insert
    await storeProviderRSRScores(env, [
      { address: 'update-test', rsr: 60, calculated_at: timestamp },
    ])

    // Update with same timestamp
    await storeProviderRSRScores(env, [
      { address: 'update-test', rsr: 65, calculated_at: timestamp },
    ])

    // Verify update worked
    const result = await env.DB.prepare(
      'SELECT rsr FROM provider_scores WHERE address = ? AND calculated_at = ?',
    )
      .bind('update-test', timestamp)
      .first()

    assert.strictEqual(result.rsr, 65, 'Should have updated RSR value')

    // Verify only one record exists
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM provider_scores WHERE address = ?',
    )
      .bind('update-test')
      .first()

    assert.strictEqual(countResult.count, 1, 'Should have only one record')
  })

  it('handles empty scores array', async () => {
    const beforeResults = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM provider_scores',
    ).first()

    // Should not throw error with empty array
    await storeProviderRSRScores(env, [])

    const afterResults = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM provider_scores',
    ).first()

    assert.strictEqual(
      afterResults.count,
      beforeResults.count,
      'Record count should not change',
    )
  })

  it('handles null or undefined scores', async () => {
    const beforeResults = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM provider_scores',
    ).first()

    // Should not throw error with null
    await storeProviderRSRScores(env, null)

    // Should not throw error with undefined
    await storeProviderRSRScores(env, undefined)

    const afterResults = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM provider_scores',
    ).first()

    assert.strictEqual(
      afterResults.count,
      beforeResults.count,
      'Record count should not change',
    )
  })

  it('respects the check_positive_rsr constraint', async () => {
    const invalidScores = [
      {
        address: 'negative-rsr-provider',
        rsr: -10,
        calculated_at: new Date().toISOString(),
      },
    ]

    // Should throw an error
    await assert.rejects(
      async () => await storeProviderRSRScores(env, invalidScores),
      /Failed to store provider RSR scores/,
      'Should reject negative RSR values',
    )

    // Verify the invalid score was not inserted
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM provider_scores WHERE address = ?',
    )
      .bind('negative-rsr-provider')
      .first()

    assert.strictEqual(result.count, 0, 'Invalid record should not be inserted')
  })

  it('handles a large batch of scores', async () => {
    await env.DB.exec('DELETE FROM provider_scores')

    const largeScoresBatch = []
    const timestamp = new Date().toISOString()

    for (let i = 1; i <= 100; i++) {
      largeScoresBatch.push({
        address: `batch-provider-${i}`,
        rsr: Math.floor(Math.random() * 101), // 0-100
        calculated_at: timestamp,
      })
    }

    await storeProviderRSRScores(env, largeScoresBatch)

    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM provider_scores WHERE address LIKE "batch-provider-%"',
    ).first()

    assert.strictEqual(countResult.count, 100, 'Should insert all 100 records')

    // Verify a random sample
    const sampleResult = await env.DB.prepare(
      'SELECT rsr FROM provider_scores WHERE address = ?',
    )
      .bind('batch-provider-50')
      .first()

    assert.ok(
      sampleResult.rsr >= 0 && sampleResult.rsr <= 100,
      'RSR should be in valid range',
    )
  })

  it('supports time-series data with multiple calculated_at timestamps', async () => {
    // Clear previous data
    await env.DB.exec(
      'DELETE FROM provider_scores WHERE address = "time-series-test"',
    )

    // Create timestamps for a week's worth of data
    const timestamps = []
    const baseDate = new Date()
    for (let i = 6; i >= 0; i--) {
      const date = new Date(baseDate)
      date.setDate(date.getDate() - i)
      timestamps.push(date.toISOString())
    }

    // Create scores with varying RSR values
    const timeSeriesScores = timestamps.map((timestamp, index) => ({
      address: 'time-series-test',
      rsr: 50 + index * 5, // 50, 55, 60, etc.
      calculated_at: timestamp,
    }))

    // Insert all time series data
    for (const scoreSet of timeSeriesScores) {
      await storeProviderRSRScores(env, [scoreSet])
    }

    // Verify all 7 records were inserted
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM provider_scores WHERE address = ?',
    )
      .bind('time-series-test')
      .first()

    assert.strictEqual(
      countResult.count,
      7,
      'Should have 7 time series records',
    )

    // Check trend of increasing values
    const timeSeriesResults = await env.DB.prepare(
      'SELECT rsr FROM provider_scores WHERE address = ? ORDER BY calculated_at',
    )
      .bind('time-series-test')
      .all()

    let previousRsr = 0
    for (const result of timeSeriesResults.results) {
      assert.ok(
        result.rsr > previousRsr || previousRsr === 0,
        'RSR should be increasing',
      )
      previousRsr = result.rsr
    }
  })
})
