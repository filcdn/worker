import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { updateOwnerRewards } from '../lib/store.js'
import { env } from 'cloudflare:test'

describe('updateOwnerRewards', () => {
  it('inserts new owner amount correctly', async () => {
    const rewardsPerOwner = {
      owner1: { reward: 100.5 },
      owner2: { reward: 250.75 },
    }
    await updateOwnerRewards(env, rewardsPerOwner)

    const results = await env.DB.prepare(
      'SELECT owner, amount FROM owner_rewards ORDER BY owner',
    ).all()

    assert.deepStrictEqual(results.results, [
      {
        owner: 'owner1',
        amount: 100.5,
      },
      {
        owner: 'owner2',
        amount: 250.75,
      },
    ])
  })

  it('updates existing owner amount', async () => {
    const updatedRewardsPerOwner = {
      owner1: { reward: 150.25 },
      owner2: { reward: 250.75 },
    }
    await updateOwnerRewards(env, updatedRewardsPerOwner)

    const results = await env.DB.prepare(
      'SELECT owner, amount FROM owner_rewards ORDER BY owner',
    ).all()

    assert.deepStrictEqual(results.results, [
      {
        owner: 'owner1',
        amount: 150.25,
      },
      {
        owner: 'owner2',
        amount: 250.75,
      },
    ])
    updatedRewardsPerOwner['owner2'] = { reward: 200 }
    await updateOwnerRewards(env, updatedRewardsPerOwner)
    const updatedResults = await env.DB.prepare(
      'SELECT owner, amount FROM owner_rewards ORDER BY owner',
    ).all()
    assert.deepStrictEqual(updatedResults.results, [
      {
        owner: 'owner1',
        amount: 150.25,
      },
      {
        owner: 'owner2',
        amount: 200,
      },
    ])
  })

  it('handles empty amount object', async () => {
    const beforeResults = await env.DB.prepare(
      'SELECT owner, amount FROM owner_rewards ORDER BY owner',
    ).all()

    const emptyRewards = {}

    await updateOwnerRewards(env, emptyRewards)

    const afterResults = await env.DB.prepare(
      'SELECT owner, amount FROM owner_rewards ORDER BY owner',
    ).all()

    assert.deepStrictEqual(afterResults.results, beforeResults.results)
  })

  it('updates rewards_calculated_at timestamp', async () => {
    const testOwner = 'timestamp-test-owner'
    const rewardsData = {
      [testOwner]: { reward: 500 },
    }

    const beforeUpdate = new Date().getTime()

    await updateOwnerRewards(env, rewardsData)

    const afterUpdate = new Date().getTime()

    const result = await env.DB.prepare(
      'SELECT rewards_calculated_at FROM owner_rewards WHERE owner = ?',
    )
      .bind(testOwner)
      .first()

    const storedTimestamp = new Date(result.rewards_calculated_at).getTime()

    assert.ok(
      storedTimestamp >= beforeUpdate && storedTimestamp <= afterUpdate,
      `Timestamp ${result.rewards_calculated_at} should be between our test timestamps`,
    )
  })

  it('updates a large number of amount in a single transaction', async () => {
    await env.DB.exec('DELETE FROM owner_rewards')

    const largeRewardsObject = {}
    for (let i = 1; i <= 100; i++) {
      largeRewardsObject[`batch-owner-${i}`] = { reward: i * 10.5 }
    }

    await updateOwnerRewards(env, largeRewardsObject)

    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM owner_rewards WHERE owner LIKE "batch-owner-%"',
    ).first()

    assert.strictEqual(countResult.count, 100)

    const sample = await env.DB.prepare(
      'SELECT amount FROM owner_rewards WHERE owner = ?',
    )
      .bind('batch-owner-50')
      .first()

    assert.strictEqual(sample.amount, 50 * 10.5)
  })

  it('handles fractional reward values correctly', async () => {
    const fractionRewards = {
      'fraction-owner-1': { reward: 0.12345 },
      'fraction-owner-2': { reward: 9999.99999 },
    }

    await updateOwnerRewards(env, fractionRewards)

    const results = await env.DB.prepare(
      'SELECT owner, amount FROM owner_rewards WHERE owner LIKE "fraction-owner-%"',
    ).all()

    assert.deepStrictEqual(results.results, [
      {
        owner: 'fraction-owner-1',
        amount: 0.12345,
      },
      {
        owner: 'fraction-owner-2',
        amount: 9999.99999,
      },
    ])
  })
})
