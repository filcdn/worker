/**
 * Logs the result of a file retrieval attempt to the D1 database.
 *
 * @param {Env} env - Worker environment (contains D1 binding).
 * @param {object} params - Parameters for the retrieval log.
 * @param {string} params.ownerAddress - The owner's address.
 * @param {string} params.clientAddress - The client's address.
 * @param {number | null} params.egressBytes - The egress bytes of the response.
 * @param {number} params.responseStatus - The HTTP response status code.
 * @param {boolean | null} params.cacheMiss - Whether the retrieval was a cache
 *   miss.
 * @param {{ fetchTtfb: number; fetchTtlb: number; workerTtfb: number }} [params.performanceStats]
 *   - Performance statistics.
 *
 * @param {string} params.timestamp - The timestamp of the retrieval.
 * @param {string | null} params.requestCountryCode - The country code where the
 *   request originated from
 * @returns {Promise<void>} - A promise that resolves when the log is inserted.
 */
export async function logRetrievalResult(env, params) {
  console.log({ msg: 'retrieval log', ...params })
  const {
    ownerAddress,
    clientAddress,
    cacheMiss,
    egressBytes,
    responseStatus,
    timestamp,
    performanceStats,
    requestCountryCode,
  } = params

  try {
    await env.DB.prepare(
      `
      INSERT INTO retrieval_logs (
        timestamp,
        owner_address,
        client_address,
        response_status,
        egress_bytes,
        cache_miss,
        fetch_ttfb,
        fetch_ttlb,
        worker_ttfb,
        request_country_code
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        timestamp,
        ownerAddress,
        clientAddress,
        responseStatus,
        egressBytes,
        cacheMiss,
        performanceStats?.fetchTtfb ?? null,
        performanceStats?.fetchTtlb ?? null,
        performanceStats?.workerTtfb ?? null,
        requestCountryCode,
      )
      .run()
  } catch (error) {
    console.error(`Error inserting log: ${error}`)
    // TODO: Handle specific SQL error codes if needed
    throw error
  }
}

/**
 * Get the owner of a given root_cid. Throws an error if the root_cid is not
 * found or mapping is incomplete.
 *
 * @param {Env} env - Worker environment (contains D1 binding).
 * @param {string} rootCid - The root CID to look up.
 * @returns {Promise<{
 *   ownerAddress?: string
 *   error?: string
 * }>}
 */
export async function getOwnerByRootCid(env, rootCid) {
  const findRootQuery = `
    SELECT set_id FROM indexer_roots
    WHERE root_cid = ?
    LIMIT 1;
  `

  const rootResult = await env.DB.prepare(findRootQuery).bind(rootCid).first()

  if (!rootResult) {
    return {
      error: `Root_cid '${rootCid}' does not exist or may not be indexed yet.`,
    }
  }
  const { set_id: setId } = /** @type {{ owner: string }} */ rootResult

  const findOwnerQuery = `
    SELECT owner FROM indexer_proof_sets
    WHERE set_id = ?
    LIMIT 1;
  `

  const ownerResult = await env.DB.prepare(findOwnerQuery).bind(setId).first()

  if (!ownerResult) {
    return {
      error: `Set_id '${setId}' is not associated with any owner, or may not be indexed yet.`,
    }
  }

  const { owner } = /** @type {{ owner: string }} */ (ownerResult)

  return { ownerAddress: owner }
}
