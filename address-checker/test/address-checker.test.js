import { describe, it, expect, vi, beforeEach } from 'vitest'
import addressCheckerWorker from '../bin/address-checker.js'
import * as sanctionCheck from '../lib/sanction-check.js'
import * as store from '../lib/store.js'

// Mock dependencies
vi.mock('../lib/sanction-check.js', () => ({
  checkAddresses: vi.fn().mockResolvedValue([
    { address: '0x1234', status: 'approved' }
  ])
}))

vi.mock('../lib/store.js', () => ({
  getAddressesToCheck: vi.fn().mockResolvedValue(['0x1234']),
  updateAddressStatuses: vi.fn().mockResolvedValue(undefined)
}))

describe('address-checker worker', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should run the scheduled address check with API key from environment', async () => {
    // Mock environment with the API key
    const mockEnv = {
      CHAINALYSIS_API_KEY: 'mock-api-key-from-environment',
      DB: { /* mock DB */ }
    }
    
    // Run the scheduled function
    await addressCheckerWorker.scheduled({}, mockEnv, {})
    
    // Verify getAddressesToCheck was called with the environment
    expect(store.getAddressesToCheck).toHaveBeenCalledWith(mockEnv)
    
    // Verify checkAddresses was called with addresses and API key from environment
    expect(sanctionCheck.checkAddresses).toHaveBeenCalledWith(
      ['0x1234'],
      'mock-api-key-from-environment'
    )
    
    // Verify updateAddressStatuses was called with environment and results
    expect(store.updateAddressStatuses).toHaveBeenCalledWith(
      mockEnv,
      [{ address: '0x1234', status: 'approved' }]
    )
  })

  it('should handle the case when no addresses need to be checked', async () => {
    // Mock empty address list
    store.getAddressesToCheck.mockResolvedValueOnce([])
    
    // Run the scheduled function
    await addressCheckerWorker.scheduled({}, { DB: {} }, {})
    
    // Verify checkAddresses was not called
    expect(sanctionCheck.checkAddresses).not.toHaveBeenCalled()
    
    // Verify updateAddressStatuses was not called
    expect(store.updateAddressStatuses).not.toHaveBeenCalled()
  })
})