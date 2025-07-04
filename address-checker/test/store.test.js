import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { 
  getAddressesToCheck, 
  updateAddressStatuses, 
  addMissingAddresses 
} from '../lib/store.js'
import { env } from 'cloudflare:test'

describe('getAddressesToCheck', () => {
  it('retrieves pending addresses from the database', async () => {
    // Setup: Insert some test addresses with different statuses
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
      ).bind('0x1111111111111111111111111111111111111111', 'pending'),
      env.DB.prepare(
        'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
      ).bind('0x2222222222222222222222222222222222222222', 'pending'),
      env.DB.prepare(
        'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
      ).bind('0x3333333333333333333333333333333333333333', 'approved'),
      env.DB.prepare(
        'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
      ).bind('0x4444444444444444444444444444444444444444', 'sanctioned')
    ])

    // Execute the function
    const pendingAddresses = await getAddressesToCheck(env)

    // Verify: Should return only the pending addresses
    assert.strictEqual(pendingAddresses.length, 2)
    assert.ok(pendingAddresses.includes('0x1111111111111111111111111111111111111111'))
    assert.ok(pendingAddresses.includes('0x2222222222222222222222222222222222222222'))
    assert.ok(!pendingAddresses.includes('0x3333333333333333333333333333333333333333'))
    assert.ok(!pendingAddresses.includes('0x4444444444444444444444444444444444444444'))
  })

  it('returns an empty array when no pending addresses exist', async () => {
    // Clear the table first
    await env.DB.prepare('DELETE FROM address_sanction_check').run()
    
    // Insert only non-pending addresses
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
      ).bind('0x5555555555555555555555555555555555555555', 'approved'),
      env.DB.prepare(
        'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
      ).bind('0x6666666666666666666666666666666666666666', 'sanctioned')
    ])

    // Execute the function
    const pendingAddresses = await getAddressesToCheck(env)

    // Verify: Should return an empty array
    assert.strictEqual(pendingAddresses.length, 0)
  })
})

describe('updateAddressStatuses', () => {
  it('updates the status of existing addresses', async () => {
    // Setup: Insert test addresses
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
      ).bind('0xaaaa111111111111111111111111111111111111', 'pending'),
      env.DB.prepare(
        'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
      ).bind('0xbbbb222222222222222222222222222222222222', 'pending')
    ])

    // Execute: Update the statuses
    const addressResults = [
      { address: '0xaaaa111111111111111111111111111111111111', status: 'approved' },
      { address: '0xbbbb222222222222222222222222222222222222', status: 'sanctioned' }
    ]
    await updateAddressStatuses(env, addressResults)

    // Verify: Addresses should have updated statuses
    const results = await env.DB.prepare(
      'SELECT address, status FROM address_sanction_check WHERE address IN (?, ?)'
    ).bind(
      '0xaaaa111111111111111111111111111111111111', 
      '0xbbbb222222222222222222222222222222222222'
    ).all()

    assert.strictEqual(results.results.length, 2)
    
    // Find each address in results and verify its status
    const addr1 = results.results.find(r => 
      r.address === '0xaaaa111111111111111111111111111111111111')
    const addr2 = results.results.find(r => 
      r.address === '0xbbbb222222222222222222222222222222222222')
    
    assert.strictEqual(addr1.status, 'approved')
    assert.strictEqual(addr2.status, 'sanctioned')
  })

  it('inserts new addresses that do not exist yet', async () => {
    // Setup: Clear any existing data
    await env.DB.prepare(
      'DELETE FROM address_sanction_check WHERE address = ?'
    ).bind('0xcccc333333333333333333333333333333333333').run()

    // Execute: Update with a new address
    const addressResults = [
      { address: '0xcccc333333333333333333333333333333333333', status: 'approved' }
    ]
    await updateAddressStatuses(env, addressResults)

    // Verify: New address should be inserted
    const result = await env.DB.prepare(
      'SELECT address, status FROM address_sanction_check WHERE address = ?'
    ).bind('0xcccc333333333333333333333333333333333333').first()

    assert.strictEqual(result.address, '0xcccc333333333333333333333333333333333333')
    assert.strictEqual(result.status, 'approved')
  })

  it('handles empty input array', async () => {
    // Execute with empty array - should not throw
    await updateAddressStatuses(env, [])
    
    // No assertions needed - just verifying it doesn't throw
  })
})

describe('addMissingAddresses', () => {
  it('adds addresses from indexer_proof_set_rails that are not in address_sanction_check', async () => {
    // Setup: Clear existing data and add test data
    await env.DB.prepare('DELETE FROM address_sanction_check').run()
    await env.DB.prepare('DELETE FROM indexer_proof_set_rails').run()
    
    // Insert test data into indexer_proof_set_rails
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)'
      ).bind('set1', 'rail1', '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', true),
      env.DB.prepare(
        'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)'
      ).bind('set2', 'rail2', '0x3333333333333333333333333333333333333333', '0x4444444444444444444444444444444444444444', true),
      // Add a duplicate to test the DISTINCT functionality
      env.DB.prepare(
        'INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn) VALUES (?, ?, ?, ?, ?)'
      ).bind('set3', 'rail3', '0x1111111111111111111111111111111111111111', '0x5555555555555555555555555555555555555555', true)
    ])
    
    // Pre-existing address in address_sanction_check
    await env.DB.prepare(
      'INSERT INTO address_sanction_check (address, status) VALUES (?, ?)'
    ).bind('0x1111111111111111111111111111111111111111', 'approved').run()

    // Execute
    const addedCount = await addMissingAddresses(env)

    // Verify: Should have added 4 new addresses (not the pre-existing one)
    assert.strictEqual(addedCount, 4)
    
    // Check that all addresses were added with 'pending' status
    const results = await env.DB.prepare(
      'SELECT address, status FROM address_sanction_check'
    ).all()
    
    // Should have 5 total addresses (1 pre-existing + 4 new)
    assert.strictEqual(results.results.length, 5)
    
    // Verify all expected addresses exist
    const addresses = results.results.map(r => r.address)
    assert.ok(addresses.includes('0x1111111111111111111111111111111111111111'))
    assert.ok(addresses.includes('0x2222222222222222222222222222222222222222'))
    assert.ok(addresses.includes('0x3333333333333333333333333333333333333333'))
    assert.ok(addresses.includes('0x4444444444444444444444444444444444444444'))
    assert.ok(addresses.includes('0x5555555555555555555555555555555555555555'))
    
    // Check that new addresses have 'pending' status
    const pending = results.results.filter(r => r.status === 'pending')
    assert.strictEqual(pending.length, 4)
    
    // Pre-existing address should still have its original status
    const preExisting = results.results.find(r => 
      r.address === '0x1111111111111111111111111111111111111111')
    assert.strictEqual(preExisting.status, 'approved')
  })

  it('returns 0 when no new addresses are found', async () => {
    // Setup: Ensure all addresses are already in address_sanction_check
    await addMissingAddresses(env) // First call to add all missing addresses
    
    // Execute again - should find no new addresses
    const addedCount = await addMissingAddresses(env)
    
    // Verify: Should have added 0 new addresses
    assert.strictEqual(addedCount, 0)
  })
})