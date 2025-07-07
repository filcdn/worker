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
            },
            {
              timestamp: Date.now(),
              message: 'Request completed',
              level: 'info',
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
    })

    expect(logBodies[2]).toMatchObject({
      message: 'Request completed',
      level: 'info',
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

  it('should log to both console and Papertrail', async () => {
    // Spy on console.log
    const consoleLogSpy = vi.spyOn(console, 'info')

    // Simulate a tail event
    const mockTailEvent = {
      events: [
        {
          outcome: 'ok',
          logs: [
            {
              timestamp: Date.now(),
              message: 'Console and Papertrail test',
              level: 'info',
            },
          ],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify console was logged to
    expect(consoleLogSpy).toHaveBeenCalled()
    expect(consoleLogSpy).toHaveBeenCalledWith('Console and Papertrail test', {
      outcome: 'ok',
    })

    // Verify fetch was also called
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Clean up
    consoleLogSpy.mockRestore()
  })

  it('should handle exceptions in tail events', async () => {
    // Spy on console.error
    const consoleErrorSpy = vi.spyOn(console, 'error')

    // Simulate a tail event with exceptions
    const mockTailEvent = {
      events: [
        {
          outcome: 'error',
          exceptions: [
            {
              timestamp: Date.now(),
              message: 'Uncaught error in worker',
              name: 'Error',
              stack:
                'Error: Uncaught error in worker\n    at Object.fetch (/worker.js:25:15)',
            },
          ],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify console.error was called for the exception
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Exception: Uncaught error in worker',
      expect.objectContaining({
        stack: expect.stringContaining('Error: Uncaught error in worker'),
        name: 'Error',
        outcome: 'error',
      }),
    )

    // Verify fetch was called to send to Papertrail
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Verify exception details were sent to Papertrail
    const logBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(logBody).toMatchObject({
      level: 'error',
      message: 'Exception: Uncaught error in worker',
      name: 'Error',
      stack: expect.stringContaining('Error: Uncaught error in worker'),
      outcome: 'error',
    })

    // Clean up
    consoleErrorSpy.mockRestore()
  })

  it('should handle both logs and exceptions in the same trace', async () => {
    // Spy on console methods
    const consoleLogSpy = vi.spyOn(console, 'info')
    const consoleErrorSpy = vi.spyOn(console, 'error')

    // Simulate a tail event with both logs and exceptions
    const mockTailEvent = {
      events: [
        {
          outcome: 'outcome',
          logs: [
            {
              timestamp: Date.now(),
              message: 'Request processing started',
              level: 'info',
            },
          ],
          exceptions: [
            {
              timestamp: Date.now(),
              message: 'Failed to process request',
              name: 'TypeError',
              stack:
                'TypeError: Failed to process request\n    at processRequest (/worker.js:42:10)',
            },
          ],
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify console methods were called
    expect(consoleLogSpy).toHaveBeenCalledWith('Request processing started', {
      outcome: 'outcome',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Exception: Failed to process request',
      {
        name: 'TypeError',
        outcome: 'outcome',
        stack:
          'TypeError: Failed to process request\n    at processRequest (/worker.js:42:10)',
      },
    )

    // Verify fetch was called twice (once for the log, once for the exception)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // Verify log content
    const logBodies = fetchSpy.mock.calls.map((call) =>
      JSON.parse(call[1].body),
    )

    // First call should be the log
    expect(logBodies[0]).toMatchObject({
      message: 'Request processing started',
      level: 'info',
      outcome: 'outcome',
    })

    // Second call should be the exception
    expect(logBodies[1]).toMatchObject({
      message: 'Exception: Failed to process request',
      level: 'error',
      name: 'TypeError',
      stack: expect.stringContaining('TypeError: Failed to process request'),
      outcome: 'outcome',
    })

    // Clean up
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('should handle trace events with no logs or exceptions gracefully', async () => {
    // Simulate a tail event with no logs or exceptions
    const mockTailEvent = {
      events: [
        {
          outcome: 'ok',
          // No logs or exceptions fields
        },
      ],
    }

    // Call the tail function
    await worker.tail(mockTailEvent, env, ctx)

    // Verify fetch was not called
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
