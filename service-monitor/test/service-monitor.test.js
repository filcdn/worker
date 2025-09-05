import { describe, it, expect, beforeEach, vi } from 'vitest'
import { env } from 'cloudflare:test'
import monitor from '../bin/service-monitor.js'

describe('Service Monitor - scheduled entrypoint', () => {
  it('calls terminateCDNServiceForSanctionedWallets with correct env', async () => {
    const mockController = {}
    const mockCtx = {}

    const mockTerminateCDNServiceForSanctionedWallets = vi
      .fn()
      .mockResolvedValue(undefined)
    await monitor.scheduled(mockController, env, mockCtx, {
      terminateCDNServiceForSanctionedWallets:
        mockTerminateCDNServiceForSanctionedWallets,
    })

    expect(
      vi.mocked(mockTerminateCDNServiceForSanctionedWallets),
    ).toHaveBeenCalledWith(env)
    expect(
      vi.mocked(mockTerminateCDNServiceForSanctionedWallets),
    ).toHaveBeenCalledTimes(1)
  })
})

describe('Service Monitor - queue entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('processes terminate-cdn-service messages correctly', async () => {
    const mockMessage = {
      body: { type: 'terminate-cdn-service', dataSetId: 123 },
      ack: vi.fn(),
      retry: vi.fn(),
    }

    const mockHandleTerminateServiceQueueMessage = vi
      .fn()
      .mockResolvedValue(undefined)
    const batch = { messages: [mockMessage] }

    // Mock the queue handler
    await monitor.queue(
      batch,
      env,
      {},
      {
        handleTerminateServiceQueueMessage:
          mockHandleTerminateServiceQueueMessage,
      },
    )

    expect(mockHandleTerminateServiceQueueMessage).toHaveBeenCalledWith(
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

    const mockHandleTransactionCancelQueueMessage = vi
      .fn()
      .mockResolvedValue(undefined)
    const batch = { messages: [mockMessage] }

    // Mock the queue handler
    await monitor.queue(
      batch,
      env,
      {},
      {
        handleTransactionCancelQueueMessage:
          mockHandleTransactionCancelQueueMessage,
      },
    )

    expect(mockHandleTransactionCancelQueueMessage).toHaveBeenCalledWith(
      mockMessage.body,
      env,
    )
    expect(mockMessage.ack).toHaveBeenCalled()
    expect(mockMessage.retry).not.toHaveBeenCalled()
  })

  it('handles unknown message types gracefully', async () => {
    const mockMessage = {
      body: { type: 'unknown-type', data: 'test' },
      ack: vi.fn(),
      retry: vi.fn(),
    }
    const batch = { messages: [mockMessage] }

    await monitor.queue(batch, env, {})

    expect(mockMessage.ack).toHaveBeenCalled()
    expect(mockMessage.retry).not.toHaveBeenCalled()
  })

  it('retries messages on handler failure', async () => {
    const error = new Error('Handler failed')
    const mockMessage = {
      body: { type: 'terminate-cdn-service', dataSetId: 456 },
      ack: vi.fn(),
      retry: vi.fn(),
    }
    const batch = { messages: [mockMessage] }
    // Mock the queue handler to throw an error
    const mockHandleTerminateServiceQueueMessage = vi
      .fn()
      .mockRejectedValue(error)

    await monitor.queue(
      batch,
      env,
      {},
      {
        handleTerminateServiceQueueMessage:
          mockHandleTerminateServiceQueueMessage,
      },
    )

    expect(mockHandleTerminateServiceQueueMessage).toHaveBeenCalledWith(
      mockMessage.body,
      env,
    )
    expect(mockMessage.ack).not.toHaveBeenCalled()
    expect(mockMessage.retry).toHaveBeenCalled()
  })

  it('processes multiple messages in batch', async () => {
    const messages = [
      {
        body: { type: 'terminate-cdn-service', dataSetId: 123 },
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
    const mockHandleTerminateServiceQueueMessage = vi
      .fn()
      .mockResolvedValue(undefined)
    const mockHandleTransactionCancelQueueMessage = vi
      .fn()
      .mockResolvedValue(undefined)

    await monitor.queue(
      batch,
      env,
      {},
      {
        handleTerminateServiceQueueMessage:
          mockHandleTerminateServiceQueueMessage,
        handleTransactionCancelQueueMessage:
          mockHandleTransactionCancelQueueMessage,
      },
    )

    expect(mockHandleTerminateServiceQueueMessage).toHaveBeenCalledWith(
      messages[0].body,
      env,
    )
    expect(mockHandleTransactionCancelQueueMessage).toHaveBeenCalledWith(
      messages[1].body,
      env,
    )
    expect(messages[0].ack).toHaveBeenCalled()
    expect(messages[1].ack).toHaveBeenCalled()
  })

  it('continues processing other messages when one fails', async () => {
    const error = new Error('First handler failed')
    const messages = [
      {
        body: { type: 'terminate-cdn-service', dataSetId: 123 },
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
    const mockHandleTerminateServiceQueueMessage = vi
      .fn()
      .mockRejectedValue(error)
    const mockHandleTransactionCancelQueueMessage = vi
      .fn()
      .mockResolvedValue(undefined)

    await monitor.queue(
      batch,
      env,
      {},
      {
        handleTerminateServiceQueueMessage:
          mockHandleTerminateServiceQueueMessage,
        handleTransactionCancelQueueMessage:
          mockHandleTransactionCancelQueueMessage,
      },
    )

    expect(mockHandleTerminateServiceQueueMessage).toHaveBeenCalledWith(
      messages[0].body,
      env,
    )
    expect(mockHandleTransactionCancelQueueMessage).toHaveBeenCalledWith(
      messages[1].body,
      env,
    )
    expect(messages[0].retry).toHaveBeenCalled()
    expect(messages[1].ack).toHaveBeenCalled()
  })
})
