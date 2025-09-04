import { describe, it, expect, beforeEach, vi } from 'vitest'
import { env } from 'cloudflare:test'

// Create comprehensive mocks with factory functions
vi.mock('../lib/terminate-cdn-service.js', () => ({
  terminateCDNServiceForSanctionedWallets: vi.fn(() => Promise.resolve()),
}))

vi.mock('../lib/queue-handlers.js', () => ({
  handleTerminateServiceQueueMessage: vi.fn(() => Promise.resolve()),
  handleTransactionCancelQueueMessage: vi.fn(() => Promise.resolve()),
}))

vi.mock('../lib/chain.js', () => ({
  getChainClient: vi.fn(() => Promise.resolve({
    writeContract: vi.fn(),
    account: { address: '0x123' },
  })),
}))

// Import the service monitor after setting up mocks
import monitor from '../bin/service-monitor.js'

// Import the mocked modules to use in tests
import { terminateCDNServiceForSanctionedWallets } from '../lib/terminate-cdn-service.js'
import {
  handleTerminateServiceQueueMessage,
  handleTransactionCancelQueueMessage,
} from '../lib/queue-handlers.js'

describe('Service Monitor - scheduled entrypoint', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM data_sets')
    await env.DB.exec('DELETE FROM wallet_details')
    vi.clearAllMocks()
  })

  it('calls terminateCDNServiceForSanctionedWallets with correct env', async () => {
    const mockController = {}
    const mockCtx = {}

    await monitor.scheduled(mockController, env, mockCtx)

    expect(
      vi.mocked(terminateCDNServiceForSanctionedWallets),
    ).toHaveBeenCalledWith(env)
    expect(
      vi.mocked(terminateCDNServiceForSanctionedWallets),
    ).toHaveBeenCalledTimes(1)
  })
})

describe('Service Monitor - queue entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processes terminate-service messages correctly', async () => {
    const mockMessage = {
      body: { type: 'terminate-service', dataSetId: 123 },
      ack: vi.fn(),
      retry: vi.fn(),
    }
    const batch = { messages: [mockMessage] }

    // Mock the queue handler
    vi.mocked(handleTerminateServiceQueueMessage).mockResolvedValue(undefined)

    await monitor.queue(batch, env, {})

    expect(vi.mocked(handleTerminateServiceQueueMessage)).toHaveBeenCalledWith(
      mockMessage.body,
      env,
    )
    expect(mockMessage.ack).toHaveBeenCalled()
    expect(mockMessage.retry).not.toHaveBeenCalled()
  })

  it('processes transaction-cancel messages correctly', async () => {
    const mockMessage = {
      body: { type: 'transaction-cancel', transactionHash: '0xabc123' },
      ack: vi.fn(),
      retry: vi.fn(),
    }
    const batch = { messages: [mockMessage] }

    // Mock the queue handler
    vi.mocked(handleTransactionCancelQueueMessage).mockResolvedValue(undefined)

    await monitor.queue(batch, env, {})

    expect(vi.mocked(handleTransactionCancelQueueMessage)).toHaveBeenCalledWith(
      mockMessage.body,
      env,
    )
    expect(mockMessage.ack).toHaveBeenCalled()
    expect(mockMessage.retry).not.toHaveBeenCalled()
  })

  it('handles unknown message types gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockMessage = {
      body: { type: 'unknown-type', data: 'test' },
      ack: vi.fn(),
      retry: vi.fn(),
    }
    const batch = { messages: [mockMessage] }

    await monitor.queue(batch, env, {})

    expect(consoleSpy).toHaveBeenCalledWith(
      'Unknown message type: unknown-type',
    )
    expect(mockMessage.ack).toHaveBeenCalled()
    expect(mockMessage.retry).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('retries messages on handler failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Handler failed')
    const mockMessage = {
      body: { type: 'terminate-service', dataSetId: 456 },
      ack: vi.fn(),
      retry: vi.fn(),
    }
    const batch = { messages: [mockMessage] }

    // Mock the queue handler to throw an error
    vi.mocked(handleTerminateServiceQueueMessage).mockRejectedValue(error)

    await monitor.queue(batch, env, {})

    expect(vi.mocked(handleTerminateServiceQueueMessage)).toHaveBeenCalledWith(
      mockMessage.body,
      env,
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to process queue message:',
      error,
    )
    expect(mockMessage.ack).not.toHaveBeenCalled()
    expect(mockMessage.retry).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('processes multiple messages in batch', async () => {
    const messages = [
      {
        body: { type: 'terminate-service', dataSetId: 123 },
        ack: vi.fn(),
        retry: vi.fn(),
      },
      {
        body: { type: 'transaction-cancel', transactionHash: '0xdef456' },
        ack: vi.fn(),
        retry: vi.fn(),
      },
    ]
    const batch = { messages }

    // Mock the queue handlers
    vi.mocked(handleTerminateServiceQueueMessage).mockResolvedValue(undefined)
    vi.mocked(handleTransactionCancelQueueMessage).mockResolvedValue(undefined)

    await monitor.queue(batch, env, {})

    expect(vi.mocked(handleTerminateServiceQueueMessage)).toHaveBeenCalledWith(
      messages[0].body,
      env,
    )
    expect(vi.mocked(handleTransactionCancelQueueMessage)).toHaveBeenCalledWith(
      messages[1].body,
      env,
    )
    expect(messages[0].ack).toHaveBeenCalled()
    expect(messages[1].ack).toHaveBeenCalled()
  })

  it('continues processing other messages when one fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('First handler failed')
    const messages = [
      {
        body: { type: 'terminate-service', dataSetId: 123 },
        ack: vi.fn(),
        retry: vi.fn(),
      },
      {
        body: { type: 'transaction-cancel', transactionHash: '0xdef456' },
        ack: vi.fn(),
        retry: vi.fn(),
      },
    ]
    const batch = { messages }

    // Mock the queue handlers - first fails, second succeeds
    vi.mocked(handleTerminateServiceQueueMessage).mockRejectedValue(error)
    vi.mocked(handleTransactionCancelQueueMessage).mockResolvedValue(undefined)

    await monitor.queue(batch, env, {})

    expect(vi.mocked(handleTerminateServiceQueueMessage)).toHaveBeenCalledWith(
      messages[0].body,
      env,
    )
    expect(vi.mocked(handleTransactionCancelQueueMessage)).toHaveBeenCalledWith(
      messages[1].body,
      env,
    )
    expect(messages[0].retry).toHaveBeenCalled()
    expect(messages[1].ack).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
