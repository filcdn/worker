/**
 * Logs and forwards events from a Tail Worker event.
 *
 * @param {TailEvent} tailEvent - The tail event containing logs
 * @param {Env} env - Environment variables
 * @param {object} options
 * @param {typeof globalThis.fetch} [options.fetch]
 * @returns {Promise<void>}
 */
export async function handleTailEvents(
  tailEvent,
  env,
  { fetch = global.fetch } = {},
) {
  if (
    !env ||
    !env.PAPERTRAIL_API_TOKEN ||
    !env.ENVIRONMENT ||
    env.ENVIRONMENT !== 'calibration '
  ) {
    console.warn(
      'PAPERTRAIL_API_TOKEN or ENVIRONMENT is not set correctly, skipping forwarding logs to Papertrail',
    )
    return
  }
  for (const trace of tailEvent.events) {
    // Handle logs
    const logs = trace.logs ?? []
    for (const log of logs) {
      // Logs are not written to the console if a tail() function is present in the worker
      // We still log them to the console for visibility
      logToConsole(log, trace.outcome)

      const payload = {
        outcome: trace.outcome,
        ...log,
      }

      await sendToPapertrail(payload, env, { fetch })
    }

    // Handle exceptions
    const exceptions = trace.exceptions ?? []
    for (const exception of exceptions) {
      // Create a log-like object for the exception to use with logToConsole
      const exceptionLog = {
        level: 'error',
        message: `Exception: ${exception.message}`,
        data: {
          stack: exception.stack,
          name: exception.name,
        },
      }

      // Exceptions do not get logged to the console if a tail() function is present in the worker
      // We log them to the console for visibility
      logToConsole(exceptionLog, trace.outcome)

      // Prepare and send exception to Papertrail
      const payload = {
        outcome: trace.outcome,
        timestamp: new Date(exception.timestamp).toISOString(),
        level: 'error',
        message: `Exception: ${exception.message}`,
        name: exception.name,
        stack: exception.stack,
      }

      await sendToPapertrail(payload, env, { fetch })
    }
  }
}

/**
 * Logs data to the console using the appropriate level
 *
 * @param {{ level: string; message: string; data?: Record<string, any> }} log
 *   - The log data
 *
 * @param {string} outcome - The outcome from the trace
 */
function logToConsole(log, outcome) {
  const { level, message, data } = log

  // Include outcome in the console log data
  const consoleData = {
    ...(data || {}),
    outcome,
  }

  switch (level) {
    case 'error':
      console.error(message, consoleData)
      break
    case 'warn':
      console.warn(message, consoleData)
      break
    case 'debug':
      console.debug(message, consoleData)
      break
    case 'info':
      console.info(message, consoleData)
      break
    default:
      console.log(message, consoleData)
      break
  }
}

/**
 * Sends a structured log to Papertrail.
 *
 * @param {Record<string, any>} data - The log data to send
 * @param {Env} env - Environment variables
 * @param {object} options
 * @param {typeof globalThis.fetch} [options.fetch]
 * @returns {Promise<void>}
 */
async function sendToPapertrail(data, env, { fetch = global.fetch } = {}) {
  const paperTrailURl =
    'https://logs.collector.na-01.cloud.solarwinds.com/v1/logs'
  try {
    const res = await fetch(paperTrailURl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: `Bearer ${env.PAPERTRAIL_API_TOKEN}`,
      },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      console.error(`Failed to send to Papertrail: ${res.status}`, {
        status: res.status,
      })
    }
  } catch (err) {
    console.error('Papertrail logging error:', err)
  }
}
