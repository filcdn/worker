import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { env } from 'cloudflare:test'
import worker from '../bin/retriever.js'

describe('Tail worker logging', () => {
  let fetchSpy
  let ctx

  beforeEach(() => {
    // Setup test environment
    env.PAPERTRAIL_API_TOKEN = 'test-token'
    env.ENVIRONMENT = 'calibration '
    env.SERVICE_NAME = 'filcdn-retriever'

    // Create a mock execution context
    ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    }

    // Spy on global fetch to capture calls to Papertrail
    fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('OK', { status: 200 })),
      )
  })

  afterEach(() => {
    // Clean up
    if (fetchSpy) {
      fetchSpy.mockRestore()
    }

    // Reset env vars
    delete env.PAPERTRAIL_API_TOKEN
    delete env.ENVIRONMENT
    delete env.SERVICE_NAME
  })

  it('should forward retrieval request logs to Papertrail', async () => {
    // Simulate a tail event that would be generated from a retrieval request
    const mockTailEvent = {
      events: [
        {
          outcome: 'ok',
          logs: [
            {
              timestamp: Date.now(),
              message: 'retrieval request',
              level: 'info',
              data: {
                DNS_ROOT: '.calibration.filcdn.io',
                url: 'https://client.calibration.filcdn.io/bagaTest',
              },
            },
          ],
        },
      ],
    }

    // Call the tail function directly with the mock event
    await worker.tail(mockTailEvent, env, ctx)

    // Verify fetch was called to send logs to Papertrail
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://logs.collector.na-01.cloud.solarwinds.com/v1/logs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/octet-stream',
          Authorization: 'Bearer test-token',
        }),
      }),
    )

    // Verify log content
    const logBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(logBody).toMatchObject({
      message: 'retrieval request',
      level: 'info',
      outcome: 'ok',
      data: {
        DNS_ROOT: '.calibration.filcdn.io',
        url: expect.stringContaining('bagaTest'),
      },
      time: expect.any(String),
    })
  })

  it('should forward error logs to Papertrail', async () => {
    // Simulate a tail event with an error log
    const mockTailEvent = {
      events: [
        {
          outcome: 'error',
          logs: [
            {
              timestamp: Date.now(),
              message: 'Error: Invalid CID',
              level: 'error',
              data: {
                status: 404,
                cid: 'invalid-cid',
              },
            },
          ],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Verify error log content
    const logBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(logBody).toMatchObject({
      message: 'Error: Invalid CID',
      level: 'error',
      outcome: 'error',
      data: {
        status: 404,
        cid: 'invalid-cid',
      },
    })
  })

  it('should handle multiple log entries in a tail event', async () => {
    // Simulate a tail event with multiple log entries
    const mockTailEvent = {
      events: [
        {
          outcome: 'ok',
          logs: [
            {
              timestamp: Date.now(),
              message: 'Request started',
              level: 'info',
            },
            {
              timestamp: Date.now(),
              message: 'Processing CID',
              level: 'info',
              data: { cid: 'bagaTest' },
            },
            {
              timestamp: Date.now(),
              message: 'Request completed',
              level: 'info',
              data: { responseTime: '120ms' },
            },
          ],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify fetch was called three times (once for each log)
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    // Verify all logs were sent with correct content
    const logBodies = fetchSpy.mock.calls.map((call) =>
      JSON.parse(call[1].body),
    )

    expect(logBodies[0]).toMatchObject({
      message: 'Request started',
      level: 'info',
    })

    expect(logBodies[1]).toMatchObject({
      message: 'Processing CID',
      level: 'info',
      data: { cid: 'bagaTest' },
    })

    expect(logBodies[2]).toMatchObject({
      message: 'Request completed',
      level: 'info',
      data: { responseTime: '120ms' },
    })
  })

  it('should handle multiple trace events', async () => {
    // Simulate a tail event with multiple trace events (e.g., from different requests)
    const mockTailEvent = {
      events: [
        {
          outcome: 'ok',
          logs: [
            {
              timestamp: Date.now(),
              message: 'Request 1',
              level: 'info',
            },
          ],
        },
        {
          outcome: 'error',
          logs: [
            {
              timestamp: Date.now(),
              message: 'Request 2 failed',
              level: 'error',
            },
          ],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify fetch was called twice (once for each trace's log)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // Verify the logs from different traces
    const firstLog = JSON.parse(fetchSpy.mock.calls[0][1].body)
    const secondLog = JSON.parse(fetchSpy.mock.calls[1][1].body)

    expect(firstLog).toMatchObject({
      message: 'Request 1',
      level: 'info',
      outcome: 'ok',
    })

    expect(secondLog).toMatchObject({
      message: 'Request 2 failed',
      level: 'error',
      outcome: 'error',
    })
  })

  it('should handle events with no logs gracefully', async () => {
    // Simulate a tail event with an empty logs array
    const mockTailEvent = {
      events: [
        {
          outcome: 'ok',
          logs: [],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify fetch was not called (no logs to process)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('should skip logging when environment is not properly configured', async () => {
    // Spy on console.warn
    const consoleWarnSpy = vi.spyOn(console, 'warn')

    // Change environment to an unsupported value
    delete env.ENVIRONMENT
    env.ENVIRONMENT = 'dev' // Not 'calibration '

    // Simulate a basic tail event
    const mockTailEvent = {
      events: [
        {
          outcome: 'ok',
          logs: [
            {
              timestamp: Date.now(),
              message: 'Test log',
              level: 'info',
            },
          ],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify fetch was NOT called
    expect(fetchSpy).not.toHaveBeenCalled()

    // Verify warning was logged
    expect(consoleWarnSpy).toHaveBeenCalled()

    // Clean up
    consoleWarnSpy.mockRestore()
  })
  it('should skip logging when api token is not configured', async () => {
    // Spy on console.warn
    const consoleWarnSpy = vi.spyOn(console, 'warn')

    // Change environment to an unsupported value
    delete env.PAPERTRAIL_API_TOKEN

    // Simulate a basic tail event
    const mockTailEvent = {
      events: [
        {
          outcome: 'ok',
          logs: [
            {
              timestamp: Date.now(),
              message: 'Test log',
              level: 'info',
            },
          ],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify fetch was NOT called
    expect(fetchSpy).not.toHaveBeenCalled()

    // Verify warning was logged
    expect(consoleWarnSpy).toHaveBeenCalled()

    // Clean up
    consoleWarnSpy.mockRestore()
  })
})
