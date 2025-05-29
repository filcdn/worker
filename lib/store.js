import createDebug from 'debug'

const debug = createDebug('filcdn:worker:store')
/**
 * Logs the result of a file retrieval attempt to the D1 database.
 *
 * @param {Env} env - Worker environment (contains D1 binding).
 * @param {object} params - Parameters for the retrieval log.
 * @param {string} params.ownerAddress - The owner's address.
 * @param {string} params.clientAddress - The client's address.
 * @param {string | null} params.contentLength - The response object.
 * @param {number} params.responseStatus - The HTTP response status code.
 * @param {boolean | null} params.cacheMiss - Whether the retrieval was a cache
 *   miss.
 * @param {{ ttfb: number; workerExecutionTime: number }} [params.performanceStats]
 *   - Performance statistics.
 *
 * @param {string} params.timestamp - The timestamp of the retrieval.
 * @returns {Promise<void>} - A promise that resolves when the log is inserted.
 */
export async function logRetrievalResult(
  env,
  {
    ownerAddress,
    clientAddress,
    cacheMiss,
    contentLength,
    responseStatus,
    timestamp,
    performanceStats,
  },
) {
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
          (timestamp,owner_address, client_address, response_status, egress_bytes, cache_miss,ttfb,worker_execution_time)
        VALUES (?, ?, ?, ?, ?, ?,?,?)
      `,
    )
      .bind(
        timestamp,
        ownerAddress,
        clientAddress,
        responseStatus,
        egressBytes,
        cacheMiss,
        performanceStats?.ttfb || null, // Time to first byte, if available
        performanceStats?.workerExecutionTime || null, // Worker execution time, if available
      )
      .run()
  } catch (error) {
    console.error('Error inserting log:', error)
    // TODO: Handle specific SQL error codes if needed
    throw error
  }
}
