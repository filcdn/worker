import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  handleTerminateServiceQueueMessage,
  handleTransactionCancelQueueMessage,
} from '../lib/queue-handlers.js'
import { env } from 'cloudflare:test'
import { abi as fwssAbi } from '../lib/filecoin-warm-storage-service.js'
import { randomId, withDataSet } from './test-helpers.js'

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
    getTransactionReceipt: vi.fn().mockResolvedValue({
      blockHash: '0xblockhash',
      blockNumber: BigInt(123),
      from: '0xfrom',
      to: '0xto',
      value: '1000000000000000000',
    }),
    getTransaction: vi.fn().mockResolvedValue({
      blockHash: '0xblockhash',
      blockNumber: BigInt(123),
      from: '0xfrom',
      to: '0xto',
      value: '1000000000000000000',
    }),
  },
})

describe('handleTerminateServiceQueueMessage', () => {
  const date = new Date(2000, 1, 1, 13)
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(date)
    await env.DB.exec('DELETE FROM data_sets')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('processes terminate service message successfully', async () => {
    const dataSetId = randomId()
    const message = { dataSetId }
    const mockEnv = createMockEnv(env)
    const mockChainClient = createMockChainClient(env)
    const mockRequest = { address: '0xcontract' }
    mockChainClient.publicClient.simulateContract.mockResolvedValue({
      request: mockRequest,
    })
    mockChainClient.walletClient.writeContract.mockResolvedValue('0xtxhash123')
    await withDataSet(mockEnv, { id: dataSetId.toString(), withCDN: true })

    await handleTerminateServiceQueueMessage(message, mockEnv, {
      getChainClient: (env) => mockChainClient,
    })

    const { results: dataSets } = await env.DB.prepare(
      'SELECT terminate_service_tx_hash FROM data_sets WHERE id = ?',
    )
      .bind(dataSetId)
      .all()

    expect(dataSets).toStrictEqual([
      { terminate_service_tx_hash: '0xtxhash123' },
    ])

    expect(mockChainClient.publicClient.simulateContract).toHaveBeenCalledWith({
      address: '0xcontract',
      abi: fwssAbi,
      functionName: 'terminateCDNService',
      args: [BigInt(dataSetId)],
    })

    expect(mockChainClient.walletClient.writeContract).toHaveBeenCalledWith(
      mockRequest,
    )

    expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).toHaveBeenCalledWith({
      id: `transaction-monitor-0xtxhash123-${date.getTime()}`,
      params: {
        transactionHash: '0xtxhash123',
      },
    })
  })

  it('handles contract simulation failure', async () => {
    const dataSetId = randomId()
    const message = { dataSetId }
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
    const message = { dataSetId: randomId() }
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
    const message = { dataSetId: randomId() }
    const error = new Error('Workflow creation failed')
    const mockEnv = createMockEnv(env)

    mockEnv.TRANSACTION_MONITOR_WORKFLOW.create.mockRejectedValue(error)

    await expect(
      handleTerminateServiceQueueMessage(message, mockEnv, {
        getChainClient: createMockChainClient,
      }),
    ).rejects.toThrow('Workflow creation failed')
  })
})

describe('handleTransactionCancelQueueMessage', () => {
  const date = new Date(2000, 1, 1, 13)
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(date)
    await env.DB.exec('DELETE FROM data_sets')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('when original transaction is still pending', () => {
    it('cancels pending transaction successfully -- get receipt raises error', async () => {
      const transactionHash = '0xoriginalhash123'
      const cancelTransactionHash = '0xtxhash123'
      const message = {
        transactionHash,
      }
      await withDataSet(env, { terminateServiceTxHash: transactionHash })
      const mockEnv = createMockEnv(env)
      const mockChainClient = createMockChainClient(env)

      // Mock that original transaction is still pending
      mockChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
        new Error('Transaction not found'),
      )
      // Mock original transaction details
      mockChainClient.publicClient.getTransaction.mockResolvedValue({
        to: '0xcontract',
        nonce: 42,
        gasPrice: 1000000000n,
        maxFeePerGas: 2000000000n,
        maxPriorityFeePerGas: 1000000000n,
      })
      mockChainClient.walletClient.sendTransaction = vi
        .fn()
        .mockResolvedValue(cancelTransactionHash)

      await handleTransactionCancelQueueMessage(message, mockEnv, {
        getChainClient: () => mockChainClient,
      })

      const { results: dataSets } = await env.DB.prepare(
        'SELECT terminate_service_tx_hash FROM data_sets WHERE terminate_service_tx_hash = ?',
      )
        .bind(transactionHash)
        .all()

      expect(dataSets).toStrictEqual([])

      const { results: updatedDataSets } = await env.DB.prepare(
        'SELECT terminate_service_tx_hash FROM data_sets WHERE terminate_service_tx_hash = ?',
      )
        .bind(cancelTransactionHash)
        .all()

      expect(updatedDataSets).toStrictEqual([
        {
          terminate_service_tx_hash: cancelTransactionHash,
        },
      ])

      expect(mockChainClient.walletClient.sendTransaction).toHaveBeenCalledWith(
        {
          to: '0xcontract',
          value: 0n,
          nonce: 42,
          gasPrice: 1500000000n,
          maxFeePerGas: 3000000000n,
          maxPriorityFeePerGas: 1500000000n,
        },
      )

      expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).toHaveBeenCalledWith({
        id: `transaction-monitor-0xtxhash123-${date.getTime()}`,
        params: {
          transactionHash: '0xtxhash123',
        },
      })
    })

    it('cancels pending transaction successfully -- receipt has no block number', async () => {
      const message = {
        transactionHash: '0xoriginalhash123',
      }
      const mockEnv = createMockEnv(env)
      const mockChainClient = createMockChainClient(env)

      // Mock that original transaction is still pending
      mockChainClient.publicClient.getTransactionReceipt.mockReturnValue(
        Promise.resolve({
          blockNumber: 0n,
        }),
      )
      // Mock original transaction details
      mockChainClient.publicClient.getTransaction.mockResolvedValue({
        to: '0xcontract',
        nonce: 42,
        gasPrice: 1000000000n,
        maxFeePerGas: 2000000000n,
        maxPriorityFeePerGas: 1000000000n,
      })
      mockChainClient.walletClient.sendTransaction = vi
        .fn()
        .mockResolvedValue('0xtxhash123')

      await handleTransactionCancelQueueMessage(message, mockEnv, {
        getChainClient: () => mockChainClient,
      })

      expect(mockChainClient.walletClient.sendTransaction).toHaveBeenCalledWith(
        {
          to: '0xcontract',
          value: 0n,
          nonce: 42,
          gasPrice: 1500000000n,
          maxFeePerGas: 3000000000n,
          maxPriorityFeePerGas: 1500000000n,
        },
      )

      expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).toHaveBeenCalledWith({
        id: `transaction-monitor-0xtxhash123-${date.getTime()}`,
        params: {
          transactionHash: '0xtxhash123',
        },
      })
    })

    it('handles legacy gas price only transactions', async () => {
      const message = {
        transactionHash: '0xoriginalhash123',
      }
      const mockEnv = createMockEnv(env)
      const mockChainClient = createMockChainClient(env)

      mockChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
        new Error('Transaction not found'),
      )
      mockChainClient.publicClient.getTransaction.mockResolvedValue({
        to: '0xcontract',
        nonce: 42,
        gasPrice: 1000000000n,
      })
      mockChainClient.walletClient.sendTransaction = vi
        .fn()
        .mockResolvedValue('0xtxhash123')

      await handleTransactionCancelQueueMessage(message, mockEnv, {
        getChainClient: () => mockChainClient,
      })

      expect(mockChainClient.walletClient.sendTransaction).toHaveBeenCalledWith(
        {
          to: '0xcontract',
          value: 0n,
          nonce: 42,
          gasPrice: 1500000000n,
          maxFeePerGas: undefined,
          maxPriorityFeePerGas: undefined,
        },
      )
    })

    it('handles EIP-1559 transactions', async () => {
      const message = {
        transactionHash: '0xoriginalhash123',
      }
      const mockEnv = createMockEnv(env)
      const mockChainClient = createMockChainClient(env)

      mockChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
        new Error('Transaction not found'),
      )
      mockChainClient.publicClient.getTransaction.mockResolvedValue({
        to: '0xcontract',
        nonce: 42,
        maxFeePerGas: 2000000000n,
        maxPriorityFeePerGas: 1000000000n,
      })
      mockChainClient.walletClient.sendTransaction = vi
        .fn()
        .mockResolvedValue('0xtxhash123')

      await handleTransactionCancelQueueMessage(message, mockEnv, {
        getChainClient: () => mockChainClient,
      })

      expect(mockChainClient.walletClient.sendTransaction).toHaveBeenCalledWith(
        {
          to: '0xcontract',
          value: 0n,
          nonce: 42,
          gasPrice: undefined,
          maxFeePerGas: 3000000000n,
          maxPriorityFeePerGas: 1500000000n,
        },
      )
    })
  })

  describe('when original transaction is already mined', () => {
    it('skips cancellation if original transaction is already mined', async () => {
      const message = {
        transactionHash: '0xoriginalhash123',
      }
      const mockEnv = createMockEnv(env)
      const mockChainClient = createMockChainClient(env)

      mockChainClient.publicClient.getTransactionReceipt.mockResolvedValue({
        status: 'success',
        blockNumber: BigInt(123456),
        transactionHash: '0xoriginalhash123',
      })
      mockChainClient.walletClient.sendTransaction = vi.fn()

      await handleTransactionCancelQueueMessage(message, mockEnv, {
        getChainClient: () => mockChainClient,
      })

      expect(
        mockChainClient.walletClient.sendTransaction,
      ).not.toHaveBeenCalled()
      expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('handles transaction retrieval failure', async () => {
      const message = {
        transactionHash: '0xoriginalhash123',
      }
      const mockEnv = createMockEnv(env)
      const mockChainClient = createMockChainClient(env)

      mockChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
        new Error('Transaction not found'),
      )
      const error = new Error('Failed to get original transaction')
      mockChainClient.publicClient.getTransaction.mockRejectedValue(error)
      mockChainClient.walletClient.sendTransaction = vi.fn()

      await expect(
        handleTransactionCancelQueueMessage(message, mockEnv, {
          getChainClient: () => mockChainClient,
        }),
      ).rejects.toThrow('Failed to get original transaction')
      expect(
        mockChainClient.walletClient.sendTransaction,
      ).not.toHaveBeenCalled()
    })

    it('handles wallet client failure', async () => {
      const message = {
        transactionHash: '0xoriginalhash123',
      }
      const mockEnv = createMockEnv(env)
      const mockChainClient = createMockChainClient(env)

      mockChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
        new Error('Transaction not found'),
      )
      mockChainClient.publicClient.getTransaction.mockResolvedValue({
        to: '0xcontract',
        nonce: 42,
        gasPrice: 1000000000n,
      })
      const error = new Error('Failed to send cancel transaction')
      mockChainClient.walletClient.sendTransaction = vi
        .fn()
        .mockRejectedValue(error)

      await expect(
        handleTransactionCancelQueueMessage(message, mockEnv, {
          getChainClient: () => mockChainClient,
        }),
      ).rejects.toThrow('Failed to send cancel transaction')
      expect(mockEnv.TRANSACTION_MONITOR_WORKFLOW.create).not.toHaveBeenCalled()
    })

    it('handles workflow creation failure', async () => {
      const message = {
        transactionHash: '0xoriginalhash123',
      }
      const mockEnv = createMockEnv(env)
      const mockChainClient = createMockChainClient(env)

      mockChainClient.publicClient.getTransactionReceipt.mockRejectedValue(
        new Error('Transaction not found'),
      )
      mockChainClient.publicClient.getTransaction.mockResolvedValue({
        to: '0xcontract',
        nonce: 42,
        gasPrice: 1000000000n,
      })
      mockChainClient.walletClient.sendTransaction = vi
        .fn()
        .mockResolvedValue('0xtxhash123')
      const error = new Error('Workflow creation failed')
      mockEnv.TRANSACTION_MONITOR_WORKFLOW.create.mockRejectedValue(error)

      await expect(
        handleTransactionCancelQueueMessage(message, mockEnv, {
          getChainClient: () => mockChainClient,
        }),
      ).rejects.toThrow('Workflow creation failed')
    })
  })
})
