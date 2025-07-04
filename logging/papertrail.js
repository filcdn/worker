/**
 * Logs and forwards events from a Tail Worker event.
 *
 * @param {TailEvent} tailEvent
 * @param {Env} env
 */
export async function logTailEvents(tailEvent, env) {
  if (
    !env ||
    !env.PAPERTRAIL_API_TOKEN ||
    !env.ENVIRONMENT ||
    env.ENVIRONMENT !== 'calibration '
  ) {
    console.warn('PAPERTRAIL_API_TOKEN is not set, skipping logging')
    return
  }
  for (const trace of tailEvent.events) {
    const logs = trace.logs ?? []

    for (const log of logs) {
      const payload = {
        time: new Date(log.timestamp).toISOString(),
        outcome: trace.outcome,
        ...log,
      }

      await sendToPapertrail(payload, env)
    }
  }
}

/**
 * Sends a structured log to Papertrail.
 *
 * @param {Record<string, any>} data
 * @param {Env} env
 */
async function sendToPapertrail(data, env) {
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
