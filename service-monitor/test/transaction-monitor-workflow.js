import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TransactionMonitorWorkflow } from '../lib/transaction-monitor-workflow.js'
import { getChainClient } from '../lib/chain.js'

// Mock the chain client
vi.mock('../lib/chain.js', () => ({
  getChainClient: vi.fn(),
}))

describe('TransactionMonitorWorkflow', () => {
  let workflow
  let mockStep
  let mockEnv
  let mockPublicClient

  beforeEach(() => {
    workflow = new TransactionMonitorWorkflow()
    mockStep = {
      do: vi.fn(),
    }
    mockPublicClient = {
      getTransaction: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    }
    mockEnv = {
      TRANSACTION_QUEUE: {
        send: vi.fn().mockResolvedValue(undefined),
      },
    }
    workflow.env = mockEnv

    // Mock the chain client
    vi.mocked(getChainClient).mockReturnValue({
      publicClient: mockPublicClient,
    })
  })

  describe('successful transaction monitoring', () => {
    it('completes successfully when transaction is mined within timeout', async () => {
      const transactionHash = '0xabc123'
      const mockTransaction = {
        nonce: 42,
        hash: transactionHash,
        from: '0xfrom',
        to: '0xto',
        value: 1000000000000000000n,
      }
      const mockReceipt = {
        transactionHash,
        status: 'success',
        blockNumber: 12345,
      }

      // Setup step mocks
      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (typeof options === 'function') {
          return await options()
        }
        return await fn()
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt)

      const payload = { transactionHash }
      await workflow.run({ payload }, mockStep)

      expect(mockStep.do).toHaveBeenCalledWith(
        'get transaction details',
        expect.any(Function),
      )
      expect(mockStep.do).toHaveBeenCalledWith(
        `wait for transaction receipt ${transactionHash}`,
        {
          timeout: '5 minutes',
          retries: {
            limit: 3,
          },
        },
        expect.any(Function),
      )
      expect(mockPublicClient.getTransaction).toHaveBeenCalledWith({
        hash: transactionHash,
      })
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: transactionHash,
      })
      expect(mockEnv.TRANSACTION_QUEUE.send).not.toHaveBeenCalled()
    })

    it('handles successful transaction with different transaction types', async () => {
      const transactionHash = '0xdef456'
      const mockTransaction = {
        nonce: 100,
        hash: transactionHash,
        type: '0x2', // EIP-1559 transaction
        maxFeePerGas: 2000000000n,
        maxPriorityFeePerGas: 1000000000n,
      }
      const mockReceipt = {
        transactionHash,
        status: 'success',
        gasUsed: 21000,
      }

      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (typeof options === 'function') {
          return await options()
        }
        return await fn()
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt)

      const payload = { transactionHash }
      await workflow.run({ payload }, mockStep)

      expect(mockPublicClient.getTransaction).toHaveBeenCalledWith({
        hash: transactionHash,
      })
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: transactionHash,
      })
      expect(mockEnv.TRANSACTION_QUEUE.send).not.toHaveBeenCalled()
    })
  })

  describe('transaction timeout handling', () => {
    it('sends cancel message when waitForTransactionReceipt times out', async () => {
      const transactionHash = '0xabc123'
      const mockTransaction = {
        nonce: 42,
        hash: transactionHash,
      }

      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          return await fn()
        }
        if (description.includes('wait for transaction receipt')) {
          throw new Error('Transaction timeout after 5 minutes')
        }
        if (description === 'send to cancel queue') {
          return await fn()
        }
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)

      const payload = { transactionHash }
      await workflow.run({ payload }, mockStep)

      expect(mockEnv.TRANSACTION_QUEUE.send).toHaveBeenCalledWith({
        type: 'transaction-cancel',
        transactionHash,
        nonce: 42,
      })
    })

    it('sends cancel message when waitForTransactionReceipt fails with network error', async () => {
      const transactionHash = '0xdef456'
      const mockTransaction = {
        nonce: 55,
        hash: transactionHash,
      }

      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          return await fn()
        }
        if (description.includes('wait for transaction receipt')) {
          throw new Error('Network connection failed')
        }
        if (description === 'send to cancel queue') {
          return await fn()
        }
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)

      const payload = { transactionHash }
      await workflow.run({ payload }, mockStep)

      expect(mockEnv.TRANSACTION_QUEUE.send).toHaveBeenCalledWith({
        type: 'transaction-cancel',
        transactionHash,
        nonce: 55,
      })
    })

    it('handles retries on waitForTransactionReceipt', async () => {
      const transactionHash = '0xghi789'
      const mockTransaction = {
        nonce: 75,
        hash: transactionHash,
      }

      let retryCount = 0
      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          return await fn()
        }
        if (description.includes('wait for transaction receipt')) {
          retryCount++
          if (retryCount <= 3) {
            throw new Error(`Retry attempt ${retryCount}`)
          }
          throw new Error('Max retries exceeded')
        }
        if (description === 'send to cancel queue') {
          return await fn()
        }
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)

      const payload = { transactionHash }
      await workflow.run({ payload }, mockStep)

      expect(mockEnv.TRANSACTION_QUEUE.send).toHaveBeenCalledWith({
        type: 'transaction-cancel',
        transactionHash,
        nonce: 75,
      })
    })
  })

  describe('error handling', () => {
    it('propagates error when getTransaction fails', async () => {
      const transactionHash = '0xabc123'
      const error = new Error('Failed to get transaction')

      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          throw error
        }
      })

      const payload = { transactionHash }
      await expect(workflow.run({ payload }, mockStep)).rejects.toThrow(
        'Failed to get transaction',
      )
      expect(mockEnv.TRANSACTION_QUEUE.send).not.toHaveBeenCalled()
    })

    it('handles queue send failure in cancel flow', async () => {
      const transactionHash = '0xabc123'
      const mockTransaction = {
        nonce: 42,
        hash: transactionHash,
      }
      const queueError = new Error('Queue is unavailable')

      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          return await fn()
        }
        if (description.includes('wait for transaction receipt')) {
          throw new Error('Transaction timeout')
        }
        if (description === 'send to cancel queue') {
          throw queueError
        }
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)

      const payload = { transactionHash }
      await expect(workflow.run({ payload }, mockStep)).rejects.toThrow(
        'Queue is unavailable',
      )
    })

    it('handles missing transaction nonce gracefully', async () => {
      const transactionHash = '0xabc123'
      const mockTransaction = {
        hash: transactionHash,
        // nonce is undefined
      }

      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          return await fn()
        }
        if (description.includes('wait for transaction receipt')) {
          throw new Error('Transaction timeout')
        }
        if (description === 'send to cancel queue') {
          return await fn()
        }
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)

      const payload = { transactionHash }
      await workflow.run({ payload }, mockStep)

      expect(mockEnv.TRANSACTION_QUEUE.send).toHaveBeenCalledWith({
        type: 'transaction-cancel',
        transactionHash,
        nonce: undefined,
      })
    })
  })

  describe('step configuration', () => {
    it('configures wait step with correct timeout and retry settings', async () => {
      const transactionHash = '0xabc123'
      const mockTransaction = {
        nonce: 42,
        hash: transactionHash,
      }
      const mockReceipt = {
        transactionHash,
        status: 'success',
      }

      let waitStepConfig
      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description.includes('wait for transaction receipt')) {
          waitStepConfig = options
          return mockReceipt
        }
        if (typeof options === 'function') {
          return await options()
        }
        return await fn()
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue(mockReceipt)

      const payload = { transactionHash }
      await workflow.run({ payload }, mockStep)

      expect(waitStepConfig).toEqual({
        timeout: '5 minutes',
        retries: {
          limit: 3,
        },
      })
    })

    it('configures cancel queue step with correct timeout', async () => {
      const transactionHash = '0xabc123'
      const mockTransaction = {
        nonce: 42,
        hash: transactionHash,
      }

      let cancelStepConfig
      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          return await fn()
        }
        if (description.includes('wait for transaction receipt')) {
          throw new Error('Transaction timeout')
        }
        if (description === 'send to cancel queue') {
          cancelStepConfig = options
          return await fn()
        }
      })

      mockPublicClient.getTransaction.mockResolvedValue(mockTransaction)

      const payload = { transactionHash }
      await workflow.run({ payload }, mockStep)

      expect(cancelStepConfig).toEqual({ timeout: '30 seconds' })
    })
  })

  describe('payload validation', () => {
    it('handles missing transactionHash in payload', async () => {
      const payload = {}

      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          return await fn()
        }
      })

      mockPublicClient.getTransaction.mockRejectedValue(
        new Error('Invalid transaction hash'),
      )

      await expect(workflow.run({ payload }, mockStep)).rejects.toThrow(
        'Invalid transaction hash',
      )
    })

    it('handles null payload', async () => {
      const payload = null

      mockStep.do.mockImplementation(async (description, options, fn) => {
        if (description === 'get transaction details') {
          return await fn()
        }
      })

      await expect(workflow.run({ payload }, mockStep)).rejects.toThrow()
    })
  })
})
