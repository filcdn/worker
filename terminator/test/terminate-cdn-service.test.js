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
    const payerAddress = '0xSanctionedAddress'
    await withWallet(env, payerAddress, true)
    await withDataSet(env, {
      id: dataSetId,
      payerAddress,
      withCDN: true,
    })

    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TRANSACTION_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).toHaveBeenCalledWith([
      { body: { dataSetId, type: 'terminate-cdn-service' } },
    ])
  })

  it('skips if `with_cdn` is `false`', async () => {
    const dataSetId = '1'
    const payerAddress = '0xSanctionedAddress'
    await withWallet(env, payerAddress, true)
    await withDataSet(env, {
      id: dataSetId,
      payerAddress,
      withCDN: false,
    })

    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TRANSACTION_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).not.toHaveBeenCalled()
  })

  it('skips if `terminate_service_tx_hash` is not `null`', async () => {
    const dataSetId = '1'
    const payerAddress = '0xSanctionedAddress'
    await withWallet(env, payerAddress, true)
    await withDataSet(env, {
      id: dataSetId,
      payerAddress,
      withCDN: true,
      terminateServiceTxHash: '0xExistingTxHash',
    })

    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TRANSACTION_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).not.toHaveBeenCalled()
  })

  it('sends multiple messages for multiple sanctioned data sets', async () => {
    const payerAddress = '0xSanctionedAddress'
    await withWallet(env, payerAddress, true)

    await withDataSet(env, {
      id: '1',
      payerAddress,
      withCDN: true,
    })

    await withDataSet(env, {
      id: '2',
      payerAddress,
      withCDN: true,
    })

    await withDataSet(env, {
      id: '3',
      payerAddress,
      withCDN: false,
    })

    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TRANSACTION_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).toHaveBeenCalledWith([
      { body: { dataSetId: '1', type: 'terminate-cdn-service' } },
      { body: { dataSetId: '2', type: 'terminate-cdn-service' } },
    ])
  })

  it('does nothing when no sanctioned data sets found', async () => {
    await withDataSet(env, {
      id: '1',
      withCDN: true,
    })

    const mockQueue = {
      sendBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TRANSACTION_QUEUE: mockQueue,
    }

    await terminateCDNServiceForSanctionedWallets(envOverride)

    expect(mockQueue.sendBatch).not.toHaveBeenCalled()
  })
})
