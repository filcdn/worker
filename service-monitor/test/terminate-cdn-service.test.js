import { describe, it, expect, beforeEach, vi } from 'vitest'
import { terminateCDNServiceForSanctionedClients } from '../lib/terminate-cdn-service.js'
import { env } from 'cloudflare:test'
import { withDataSet, withSanctionedWallet } from './test-helpers.js'

describe('terminateCDNServiceForSanctionedClients', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM data_sets')
    await env.DB.exec('DELETE FROM wallet_details')
    vi.clearAllMocks()
  })

  it('creates workflow for sanctioned data sets', async () => {
    const dataSetId = '1'
    const sanctionedAddress = '0xSanctionedAddress'
    await withSanctionedWallet(env, sanctionedAddress)
    await withDataSet(env, {
      id: dataSetId,
      storageProviderAddress: sanctionedAddress,
      payerAddress: '0xPayer',
      payeeAddress: '0xPayee',
    })

    const mockWorkflow = {
      get: vi.fn().mockResolvedValue(undefined),
      createBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TERMINATE_CDN_SERVICE_WORKFLOW: mockWorkflow,
    }
    await terminateCDNServiceForSanctionedClients(envOverride)
    expect(mockWorkflow.createBatch).toHaveBeenCalled()
  })

  it('skips workflow if `with_cdn` is `false`', async () => {
    const dataSetId = '1'
    const sanctionedAddress = '0xSanctionedAddress'
    await withSanctionedWallet(env, sanctionedAddress)
    await withDataSet(env, {
      id: dataSetId,
      storageProviderAddress: sanctionedAddress,
      payerAddress: '0xPayer',
      payeeAddress: '0xPayee',
      withCDN: false,
    })

    const mockWorkflow = {
      get: vi.fn().mockResolvedValue(undefined),
      createBatch: vi.fn().mockResolvedValue(undefined),
    }
    const envOverride = {
      ...env,
      TERMINATE_CDN_SERVICE_WORKFLOW: mockWorkflow,
    }
    await terminateCDNServiceForSanctionedClients(envOverride)
    expect(mockWorkflow.createBatch).not.toHaveBeenCalled()
  })

  it('skips workflow if already running', async () => {
    const dataSetId = '1'
    const sanctionedAddress = '0xSanctionedAddress'
    await withSanctionedWallet(env, sanctionedAddress)
    await withDataSet(env, {
      id: dataSetId,
      storageProviderAddress: sanctionedAddress,
      payerAddress: '0xPayer',
      payeeAddress: '0xPayee',
    })
    const mockWorkflow = {
      get: vi.fn().mockResolvedValue({ status: 'running' }),
      createBatch: vi.fn(),
    }
    const envOverride = {
      ...env,
      TERMINATE_CDN_SERVICE_WORKFLOW: mockWorkflow,
    }
    await terminateCDNServiceForSanctionedClients(envOverride)
    expect(mockWorkflow.createBatch).not.toHaveBeenCalled()
  })

  it('restarts workflow if errorred', async () => {
    const dataSetId = '1'
    const sanctionedAddress = '0xSanctionedAddress'
    await withSanctionedWallet(env, sanctionedAddress)
    await withDataSet(env, {
      id: dataSetId,
      storageProviderAddress: sanctionedAddress,
      payerAddress: '0xPayer',
      payeeAddress: '0xPayee',
    })
    const mockWorkflow = {
      get: vi
        .fn()
        .mockResolvedValue({ status: 'errored', error: 'Some error' }),
      restart: vi.fn(),
    }
    const envOverride = {
      ...env,
      TERMINATE_CDN_SERVICE_WORKFLOW: mockWorkflow,
    }
    await terminateCDNServiceForSanctionedClients(envOverride)
    expect(mockWorkflow.restart).toHaveBeenCalled()
  })
})
