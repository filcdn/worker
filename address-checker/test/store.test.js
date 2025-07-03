import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { getAddressesToCheck, updateAddressStatuses, getAddressStatus } from '../lib/store.js'
import { unstable_dev } from 'wrangler'

describe('store', () => {
  let worker
  let env

  beforeAll(async () => {
    worker = await unstable_dev(
      './bin/address-checker.js',
      {
        experimental: { disableExperimentalWarning: true }
      }
    )
    env = worker.env
  })

  afterEach(async () => {
    // Clean up test data after each test
    await env.DB.prepare('DELETE FROM address_sanction_check').run()
    await env.DB.prepare('DELETE FROM indexer_proof_set_rails').run()
  })

  it('should get addresses to check', async () => {
    // Insert test data
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn)
        VALUES (?, ?, ?, ?, ?)
      `).bind('1', '1', '0x1234567890abcdef1234567890abcdef12345678', '0x2A06D234246eD18b6C91de8349fF34C22C7268e2', true),
      
      env.DB.prepare(`
        INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn)
        VALUES (?, ?, ?, ?, ?)
      `).bind('2', '1', '0x1234567890abcdef1234567890abcdef12345678', '0x3333333333333333333333333333333333333333', true)
    ])

    const addresses = await getAddressesToCheck(env)

    // Should return all unique addresses
    expect(addresses).toHaveLength(3)
    expect(addresses).toContain('0x1234567890abcdef1234567890abcdef12345678')
    expect(addresses).toContain('0x2A06D234246eD18b6C91de8349fF34C22C7268e2')
    expect(addresses).toContain('0x3333333333333333333333333333333333333333')
  })

  it('should update address statuses', async () => {
    const addressResults = [
      { address: '0x1234567890abcdef1234567890abcdef12345678', status: 'sanctioned' },
      { address: '0x2A06D234246eD18b6C91de8349fF34C22C7268e2', status: 'approved' }
    ]

    await updateAddressStatuses(env, addressResults)

    // Check that statuses were updated
    const status1 = await getAddressStatus(env, '0x1234567890abcdef1234567890abcdef12345678')
    const status2 = await getAddressStatus(env, '0x2A06D234246eD18b6C91de8349fF34C22C7268e2')

    expect(status1).toBe('sanctioned')
    expect(status2).toBe('approved')
  })

  it('should update existing statuses', async () => {
    // Insert initial data
    await env.DB.prepare(`
      INSERT INTO address_sanction_check (address, status, last_checked)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).bind('0x1234567890abcdef1234567890abcdef12345678', 'pending').run()

    // Update the status
    await updateAddressStatuses(env, [
      { address: '0x1234567890abcdef1234567890abcdef12345678', status: 'sanctioned' }
    ])

    // Check that status was updated
    const status = await getAddressStatus(env, '0x1234567890abcdef1234567890abcdef12345678')
    expect(status).toBe('sanctioned')
  })

  it('should return null for unknown addresses', async () => {
    const status = await getAddressStatus(env, '0x9999999999999999999999999999999999999999')
    expect(status).toBeNull()
  })
})