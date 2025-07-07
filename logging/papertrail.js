/**
 * Logs and forwards events from a Tail Worker event.
 *
 * @param {TailEvent} tailEvent - The tail event containing logs
 * @param {Env} env - Environment variables
 * @param {object} options
 * @param {typeof globalThis.fetch} [options.fetch]
 * @returns {Promise<void>}
 */
export async function logTailEvents(
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
    const logs = trace.logs ?? []

    for (const log of logs) {
      const payload = {
        outcome: trace.outcome,
        ...log,
      }

      await sendToPapertrail(payload, env, { fetch })
    }
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
      console.error(`Failed to send to Papertrail: ${res.status}`)
    }
  } catch (err) {
    console.error('Papertrail logging error:', err)
  }
}
