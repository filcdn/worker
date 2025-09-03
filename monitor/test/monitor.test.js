import { describe, it, expect, beforeEach, vi } from 'vitest'
import monitor, { TerminateCDNServiceWorkflow } from '../bin/monitor.js'
import { env } from 'cloudflare:test'
import { withDataSet, withSanctionedWallet } from './test-helpers.js'

describe('scheduled entrypoint', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM data_sets')
    await env.DB.exec('DELETE FROM wallet_details')
    vi.clearAllMocks()
  })

  it('calls terminateCDNServiceForSanctionedClients with injected contract', async () => {
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
    const mockContract = {}
    const mockGetContract = vi.fn().mockResolvedValue(mockContract)
    await monitor.scheduled(null, envOverride, null, {
      getFilecoinWarmStorageServiceContract: mockGetContract,
    })
    expect(mockGetContract).toHaveBeenCalledWith(envOverride)
    expect(mockWorkflow.createBatch).toHaveBeenCalled()
  })
})

describe('TerminateCDNServiceWorkflow', () => {
  it('runs and terminates CDN service', async () => {
    const dataSetId = '1'
    const mockContract = {
      write: {
        terminateCDNService: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({ transactionHash: '0xabc' }),
        }),
      },
    }
    const workflow = new TerminateCDNServiceWorkflow()
    const step = {
      do: vi.fn(async (_desc, _opts, fn) => await fn()),
    }
    const payload = { dataSetId, contract: mockContract }
    await workflow.run({ payload }, step)
    expect(mockContract.write.terminateCDNService).toHaveBeenCalledWith(
      BigInt(dataSetId),
    )
  })
})
