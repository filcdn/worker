import createDebug from 'debug'

const debug = createDebug('filcdn:worker:store')

/**
 * Logs the result of a file retrieval attempt to the D1 database.
 *
 * @param {Env} env - Worker environment (contains D1 binding).
 * @param {object} params - Parameters for the retrieval log.
 * @param {string} params.ownerAddress - The owner's address.
 * @param {string} params.clientAddress - The client's address.
 * @param {Response} params.response - The response object.
 * @param {boolean} params.cacheMiss - Whether the retrieval was a cache miss.
 * @param {number} params.timestamp - The timestamp of the retrieval.
 * @returns {Promise<void>} - A promise that resolves when the log is inserted.
 */
export async function logRetrievalResult(
  env,
  { ownerAddress, clientAddress, response, cacheMiss, timestamp },
) {
  const responseStatus = response.status
  const contentLength = response.headers.get('content-length')
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
