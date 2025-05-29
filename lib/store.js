import debug from 'debug'

/**
 * Logs the result of a file retrieval attempt to the D1 database.
 *
 * @param {object} env - Worker environment (contains D1 binding).
 * @param {object} context - Retrieval context: { ownerAddress, clientAddress,
 *   response, timestamp }
 * @returns {Promise<void>} - A promise that resolves when the log is inserted.
 */
export async function logRetrievalResult(
  env,
  { ownerAddress, clientAddress, response, timestamp },
) {
  const responseStatus = response.status
  const cacheMiss = response.headers.get('CF-Cache-Status') !== 'HIT'
  const contentLength = response.headers.get('Content-Length')
  if (!contentLength) {
    debug(
      'No content-length header found in response for pieceCid=%s and hostname=%s',
      ownerAddress,
      clientAddress,
    )
  }
  const egressBytes = contentLength ? parseInt(contentLength, 10) : 0

  try {
    await env.DB.prepare(
      `
        INSERT INTO retrieval_logs 
          (timestamp,owner_address, client_address, response_status, egress_bytes, cache_miss)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        timestamp,
        ownerAddress,
        clientAddress,
        responseStatus,
        egressBytes,
        cacheMiss,
      )
      .run()
  } catch (error) {
    console.error('Error inserting log:', error)
    // TODO: Handle specific SQL error codes if needed
    throw error
  }
}
