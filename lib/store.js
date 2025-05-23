/**
 * Logs the result of a file retrieval attempt to the D1 database.
 *
 * @param {object} env - Worker environment (contains D1 binding).
 * @param {object} context - Retrieval context: { hostname, pieceCid, response, error }
 */
export async function logRetrievalResult (env, { hostname, pieceCid, response, error }) {
  const timestamp = new Date().toISOString()
  let success = 0
  let errorReason = null
  let egressBytes = 0

  if (error) {
    errorReason = error.message
  } else if (!response.ok) {
    errorReason = `HTTP ${response.status}`
  } else {
    success = 1
    const contentLength = response.headers.get('content-length')
    egressBytes = contentLength ? parseInt(contentLength, 10) : 0
  }

  await env.DB.prepare(`
      INSERT INTO retrieval_logs 
        (timestamp, hostname, piece_cid, success, error_reason, egress_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
    timestamp,
    hostname,
    pieceCid,
    success,
    errorReason,
    egressBytes
  ).run()

  return { success, error_reason: errorReason, egress_bytes: egressBytes }
}
