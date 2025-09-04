// import { describe, it, expect, beforeEach, vi } from 'vitest'
// import monitor from '../bin/service-monitor.js'
// import { env } from 'cloudflare:test'
// import { withDataSet, withSanctionedWallet } from './test-helpers.js'

// describe('scheduled entrypoint', () => {
//   beforeEach(async () => {
//     await env.DB.exec('DELETE FROM data_sets')
//     await env.DB.exec('DELETE FROM wallet_details')
//     vi.clearAllMocks()
//   })

//   it('calls terminateCDNServiceForSanctionedClients with correct env', async () => {
//     const dataSetId = '1'
//     const sanctionedAddress = '0xSanctionedAddress'
//     await withSanctionedWallet(env, sanctionedAddress)
//     await withDataSet(env, {
//       id: dataSetId,
//       storageProviderAddress: sanctionedAddress,
//       payerAddress: '0xPayer',
//       payeeAddress: '0xPayee',
//     })

//     const mockWorkflow = {
//       get: vi.fn().mockResolvedValue(undefined),
//       createBatch: vi.fn().mockResolvedValue(undefined),
//     }
//     const envOverride = {
//       ...env,
//       TERMINATE_CDN_SERVICE_WORKFLOW: mockWorkflow,
//     }
//     await monitor.scheduled(null, envOverride, null)
//     expect(mockWorkflow.createBatch).toHaveBeenCalled()
//   })
// })

// describe('TerminateCDNServiceWorkflow', () => {
//   it('runs and terminates CDN service', async () => {
//     const dataSetId = '1'
//     const mockContract = {
//       write: {
//         terminateCDNService: vi.fn().mockResolvedValue({
//           wait: vi.fn().mockResolvedValue({ transactionHash: '0xabc' }),
//         }),
//       },
//     }
//     const mockGetContract = vi.fn().mockReturnValue(mockContract)
//     const workflow = new TerminateCDNServiceWorkflow()
//     const step = {
//       do: vi.fn(async (_desc, _opts, fn) => await fn()),
//     }
//     const payload = { dataSetId }
//     await workflow.run({ payload }, step, {
//       getFilecoinWarmStorageServiceContract: mockGetContract,
//     })
//     expect(mockGetContract).toHaveBeenCalled()
//     expect(mockContract.write.terminateCDNService).toHaveBeenCalledWith(
//       BigInt(dataSetId),
//     )
//   })
// })
