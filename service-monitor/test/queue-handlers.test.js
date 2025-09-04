import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  handleTerminateServiceQueueMessage,
  // handleTransactionCancelQueueMessage,
} from '../lib/queue-handlers.js'
import { env } from 'cloudflare:test'

// Test fixtures and helpers
const createMockEnv = (env) => ({
  ...env,
  ENVIRONMENT: 'calibration',
  RPC_URL: 'https://api.calibration.node.glif.io/',
  FILECOIN_WARM_STORAGE_SERVICE_ADDRESS: '0xcontract',
  FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY: '0xprivatekey',
  TRANSACTION_MONITOR_WORKFLOW: {
    create: vi.fn().mockResolvedValue(undefined),
  },
  TRANSACTION_QUEUE: {
    send: vi.fn().mockResolvedValue(undefined),
  },
})

const createMockChainClient = (env) => ({
  walletClient: {
    writeContract: vi.fn().mockResolvedValue('0xtxhash123'),
  },
  publicClient: {
    simulateContract: vi.fn().mockResolvedValue({}),
  },
})

describe('handleTerminateServiceQueueMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processes terminate service message successfully', async () => {
    const message = { dataSetId: 123 }
    const mockEnv = createMockEnv(env)
    const mockChainClient = createMockChainClient(env)
    const mockRequest = { address: '0xcontract' }
    mockChainClient.publicClient.simulateContract.mockResolvedValue({
      request: mockRequest,
    })
    mockChainClient.walletClient.writeContract.mockResolvedValue('0xtxhash123')

    await handleTerminateServiceQueueMessage(message, mockEnv, {
      getChainClient: (env) => mockChainClient,
    })

    expect(mockChainClient.publicClient.simulateContract).toHaveBeenCalledWith({
      address: '0xcontract',
      abi: ['function terminateCDNService(uint256) external'],
      functionName: 'terminateCDNService',
      args: [123],
    })

    expect(mockChainClient.walletClient.writeContract).toHaveBeenCalledWith(
      mockRequest,
    )

    expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).toHaveBeenCalledWith({
      transactionHash: '0xtxhash123',
    })
  })

  it('handles contract simulation failure', async () => {
    const message = { dataSetId: 456 }
    const error = new Error('Contract simulation failed')
    const mockEnv = createMockEnv(env)
    const mockChainClient = createMockChainClient()

    mockChainClient.publicClient.simulateContract.mockRejectedValue(error)

    await expect(
      handleTerminateServiceQueueMessage(message, mockEnv, {
        getChainClient: (env) => mockChainClient,
      }),
    ).rejects.toThrow('Contract simulation failed')
    expect(mockChainClient.walletClient.writeContract).not.toHaveBeenCalled()
    expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).not.toHaveBeenCalled()
  })

  it('handles contract call failure', async () => {
    const message = { dataSetId: 789 }
    const error = new Error('Contract call failed')
    const mockEnv = createMockEnv(env)
    const mockChainClient = createMockChainClient()

    mockChainClient.walletClient.writeContract.mockRejectedValue(error)

    await expect(
      handleTerminateServiceQueueMessage(message, mockEnv, {
        getChainClient: (env) => mockChainClient,
      }),
    ).rejects.toThrow('Contract call failed')
    expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).not.toHaveBeenCalled()
  })

  it('handles workflow creation failure', async () => {
    const message = { dataSetId: 999 }
    const error = new Error('Workflow creation failed')
    const mockEnv = createMockEnv(env)

    mockEnv.TRANSACTION_MONITOR_WORKFLOW.create.mockRejectedValue(error)

    await expect(
      handleTerminateServiceQueueMessage(message, mockEnv, {
        getChainClient: createMockChainClient,
      }),
    ).rejects.toThrow('Workflow creation failed')
  })

  // it('uses injected getChainClient dependency', async () => {
  //   const message = { dataSetId: 123 }
  //   const mockEnv = createMockEnv(env)
  //   const mockChainClient = createMockChainClient()
  //   const mockGetChainClient = vi.fn().mockReturnValue(mockChainClient)

  //   await handleTerminateServiceQueueMessage(message, mockEnv, {
  //     getChainClient: vi.fn().mockReturnValue(mockChainClient),
  //   })

  //   expect(mockGetChainClient).toHaveBeenCalledWith(mockEnv)
  //   expect(mockChainClient.publicClient.simulateContract).toHaveBeenCalled()
  // })
})

// describe('handleTransactionCancelQueueMessage', () => {
//   let mockEnv
//   let mockChainClient
//   let mockAccount

//   beforeEach(() => {
//     vi.clearAllMocks()

//     mockEnv = createMockEnv()
//     mockAccount = createMockAccount()
//     mockChainClient = createMockChainClient()

//     privateKeyToAccount.mockReturnValue(mockAccount)
//     getChainClient.mockReturnValue(mockChainClient)
//   })

//   describe('when original transaction is still pending', () => {
//     beforeEach(() => {
//       // Mock that original transaction is still pending
//       mockChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
//         new Error('Transaction not found'),
//       )

//       // Mock original transaction details
//       mockChainClient.publicClient.getTransaction.mockResolvedValue({
//         to: '0xcontract',
//         nonce: 42,
//         gasPrice: 1000000000n,
//         maxFeePerGas: 2000000000n,
//         maxPriorityFeePerGas: 1000000000n,
//       })
//     })

//     it('cancels pending transaction successfully', async () => {
//       const message = {
//         transactionHash: '0xoriginalhash123',
//         nonce: 42,
//         dataSetId: 123,
//       }

//       await handleTransactionCancelQueueMessage(message, mockEnv)

//       expect(mockChainClient.walletClient.sendTransaction).toHaveBeenCalledWith(
//         {
//           to: '0xcontract',
//           value: 0n,
//           nonce: 42,
//           gasPrice: 1500000000n, // 150% of original
//           maxFeePerGas: 3000000000n, // 150% of original
//           maxPriorityFeePerGas: 1500000000n, // 150% of original
//         },
//       )

//       expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).toHaveBeenCalledWith({
//         transactionHash: '0xtxhash123',
//         nonce: 42,
//         dataSetId: undefined, // dataSetId not available in current implementation
//         isCancellation: true,
//         originalTransactionHash: '0xoriginalhash123',
//       })
//     })

//     it('handles legacy gas price only transactions', async () => {
//       const message = {
//         transactionHash: '0xoriginalhash123',
//         nonce: 42,
//         dataSetId: 123,
//       }

//       mockChainClient.publicClient.getTransaction.mockResolvedValue({
//         to: '0xcontract',
//         nonce: 42,
//         gasPrice: 1000000000n,
//         // No maxFeePerGas or maxPriorityFeePerGas
//       })

//       await handleTransactionCancelQueueMessage(message, mockEnv)

//       expect(mockChainClient.walletClient.sendTransaction).toHaveBeenCalledWith(
//         {
//           to: '0xcontract',
//           value: 0n,
//           nonce: 42,
//           gasPrice: 1500000000n,
//           maxFeePerGas: undefined,
//           maxPriorityFeePerGas: undefined,
//         },
//       )
//     })

//     it('handles EIP-1559 transactions', async () => {
//       const message = {
//         transactionHash: '0xoriginalhash123',
//         nonce: 42,
//         dataSetId: 123,
//       }

//       mockChainClient.publicClient.getTransaction.mockResolvedValue({
//         to: '0xcontract',
//         nonce: 42,
//         maxFeePerGas: 2000000000n,
//         maxPriorityFeePerGas: 1000000000n,
//         // No gasPrice for EIP-1559
//       })

//       await handleTransactionCancelQueueMessage(message, mockEnv)

//       expect(mockChainClient.walletClient.sendTransaction).toHaveBeenCalledWith(
//         {
//           to: '0xcontract',
//           value: 0n,
//           nonce: 42,
//           gasPrice: undefined,
//           maxFeePerGas: 3000000000n,
//           maxPriorityFeePerGas: 1500000000n,
//         },
//       )
//     })
//   })

//   describe('when original transaction is already mined', () => {
//     beforeEach(() => {
//       // Mock that original transaction is already mined
//       mockChainClient.publicClient.getTransactionReceipt.mockResolvedValue({
//         status: 'success',
//         transactionHash: '0xoriginalhash123',
//       })
//     })

//     it('skips cancellation if original transaction is already mined', async () => {
//       const message = {
//         transactionHash: '0xoriginalhash123',
//         nonce: 42,
//         dataSetId: 123,
//       }

//       await handleTransactionCancelQueueMessage(message, mockEnv)

//       expect(
//         mockChainClient.walletClient.sendTransaction,
//       ).not.toHaveBeenCalled()
//       expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).not.toHaveBeenCalled()
//     })
//   })

//   describe('error handling', () => {
//     beforeEach(() => {
//       mockChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
//         new Error('Transaction not found'),
//       )
//       mockChainClient.publicClient.getTransaction.mockResolvedValue({
//         to: '0xcontract',
//         nonce: 42,
//         gasPrice: 1000000000n,
//       })
//     })

//     it('handles transaction retrieval failure', async () => {
//       const message = {
//         transactionHash: '0xoriginalhash123',
//         nonce: 42,
//         dataSetId: 123,
//       }

//       const error = new Error('Failed to get original transaction')
//       mockChainClient.publicClient.getTransaction.mockRejectedValue(error)

//       await expect(
//         handleTransactionCancelQueueMessage(message, mockEnv),
//       ).rejects.toThrow('Failed to get original transaction')
//       expect(
//         mockChainClient.walletClient.sendTransaction,
//       ).not.toHaveBeenCalled()
//     })

//     it('handles wallet client failure', async () => {
//       const message = {
//         transactionHash: '0xoriginalhash123',
//         nonce: 42,
//         dataSetId: 123,
//       }

//       const error = new Error('Failed to send cancel transaction')
//       mockChainClient.walletClient.sendTransaction.mockRejectedValue(error)

//       await expect(
//         handleTransactionCancelQueueMessage(message, mockEnv),
//       ).rejects.toThrow('Failed to send cancel transaction')
//       expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).not.toHaveBeenCalled()
//     })

//     it('handles workflow creation failure', async () => {
//       const message = {
//         transactionHash: '0xoriginalhash123',
//         nonce: 42,
//         dataSetId: 123,
//       }

//       const error = new Error('Workflow creation failed')
//       mockEnv.TRANSACTION_MONITOR_WORKFLOW.create.mockRejectedValue(error)

//       await expect(
//         handleTransactionCancelQueueMessage(message, mockEnv),
//       ).rejects.toThrow('Workflow creation failed')
//     })
//   })

//   it('uses injected getChainClient dependency', async () => {
//     const message = {
//       transactionHash: '0xoriginalhash123',
//       nonce: 42,
//       dataSetId: 123,
//     }

//     const customChainClient = createMockChainClient()
//     customChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
//       new Error('Transaction not found'),
//     )
//     customChainClient.publicClient.getTransaction.mockResolvedValue({
//       to: '0xcontract',
//       nonce: 42,
//       gasPrice: 1000000000n,
//     })

//     const mockGetChainClient = vi.fn().mockReturnValue(customChainClient)

//     await handleTransactionCancelQueueMessage(message, mockEnv, {
//       getChainClient: mockGetChainClient,
//     })

//     expect(mockGetChainClient).toHaveBeenCalledWith(mockEnv)
//     expect(
//       customChainClient.publicClient.getTransactionReceipt,
//     ).toHaveBeenCalled()
//   })
// })
