import { describe, it, expect, beforeEach, vi } from 'vitest'
import { terminateCDNServiceForSanctionedWallets } from '../lib/terminate-cdn-service.js'
import { env } from 'cloudflare:test'
import { withDataSet, withWallet } from './test-helpers.js'

describe('terminateCDNServiceForSanctionedWallets', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM data_sets')
    await env.DB.exec('DELETE FROM wallet_details')
    vi.clearAllMocks()
  })

  it('sends messages to queue for sanctioned data sets', async () => {
    const dataSetId = '1'
    const sanctionedAddress = '0xSanctionedAddress'
    await withWallet(env, sanctionedAddress, true)
    await withDataSet(env, {
      id: dataSetId,
      storageProviderAddress: sanctionedAddress,
      payerAddress: '0xPayer',
      payeeAddress: '0xPayee',
    })

    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TERMINATE_SERVICE_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).toHaveBeenCalledWith([
      { dataSetId, type: 'terminate-cdn-service' },
    ])
  })

  it('skips if `with_cdn` is `false`', async () => {
    const dataSetId = '1'
    const sanctionedAddress = '0xSanctionedAddress'
    await withWallet(env, sanctionedAddress, true)
    await withDataSet(env, {
      id: dataSetId,
      storageProviderAddress: sanctionedAddress,
      payerAddress: '0xPayer',
      payeeAddress: '0xPayee',
      withCDN: false,
    })

    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TERMINATE_SERVICE_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).not.toHaveBeenCalled()
  })

  it('sends multiple messages for multiple sanctioned data sets', async () => {
    const sanctionedAddress = '0xSanctionedAddress'
    await withWallet(env, sanctionedAddress, true)

    await withDataSet(env, {
      id: '1',
      storageProviderAddress: sanctionedAddress,
      payerAddress: '0xPayer',
      payeeAddress: '0xPayee',
    })

    await withDataSet(env, {
      id: '2',
      storageProviderAddress: '0xCleanProvider',
      payerAddress: sanctionedAddress,
      payeeAddress: '0xPayee',
    })

    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TERMINATE_SERVICE_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).toHaveBeenCalledWith([
      { dataSetId: '1', type: 'terminate-cdn-service' },
      { dataSetId: '2', type: 'terminate-cdn-service' },
    ])
  })

  it('does nothing when no sanctioned data sets found', async () => {
    const spAddress = '0xSp'
    await withWallet(env, spAddress, false)

    await withDataSet(env, {
      id: '1',
      storageProviderAddress: spAddress,
      payerAddress: '0xPayer',
      payeeAddress: '0xPayee',
    })
    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TERMINATE_SERVICE_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).not.toHaveBeenCalled()
  })
})
