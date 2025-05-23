/**
 * Logs the result of a file retrieval attempt to the D1 database.
 *
 * @param {object} env - Worker environment (contains D1 binding).
 * @param {object} context - Retrieval context: { hostname, pieceCid, response, error }
 * @returns {Promise<void>} - A promise that resolves when the log is inserted.
 */
export async function logRetrievalResult (env, { hostname, pieceCid, response, cacheMiss }) {
  const timestamp = new Date().toISOString()
  const responseStatus = response.status
  const contentLength = response.headers.get('content-length')
  const egressBytes = contentLength ? parseInt(contentLength, 10) : 0

  try {
    await env.DB.prepare(`
        INSERT INTO retrieval_logs 
          (timestamp, hostname, piece_cid, response_status, egress_bytes, cache_miss)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
      timestamp,
      hostname,
      pieceCid,
      responseStatus,
      egressBytes,
      cacheMiss
    ).run()
  } catch (error) {
    console.error('Error inserting log:', error)
    // TODO: Handle specific SQL error codes if needed
  }
}
