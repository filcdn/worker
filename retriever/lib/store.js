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
 * Retrieves the approved owner address for a given root CID.
 *
 * @param {Env} env - Cloudflare Worker environment with D1 DB binding
 * @param {string} rootCid - The root CID to look up
 * @returns {Promise<{
 *   ownerAddress?: string
 *   error?: string
 * }>} - The result
 *   containing either the approved owner address or a descriptive error
 */
export async function getOwnerByRootCid(env, rootCid) {
  const approvedOwners = [
    '0x2A06D234246eD18b6C91de8349fF34C22C7268e8',
    '0x12191de399B9B3FfEB562861f9eD62ea8da18AE5',
    '0x4A628ebAecc32B8779A934ebcEffF1646F517756',
    '0x9f5087a1821eb3ed8a137be368e5e451166efaae',
    '0xCb9e86945cA31E6C3120725BF0385CBAD684040c',
  ]

  const query = `
   SELECT ir.set_id, ips.owner
   FROM indexer_roots ir
   LEFT OUTER JOIN indexer_proof_sets ips
     ON ir.set_id = ips.set_id
   WHERE ir.root_cid = ?
   LIMIT 1;
 `

  /** @type {{ set_id: string; owner: string | null } | null} */
  const result = await env.DB.prepare(query).bind(rootCid).first()

  if (!result) {
    return {
      error: `Root_cid '${rootCid}' does not exist or may not be indexed yet.`,
    }
  }

  const { set_id: setId, owner } = result

  if (owner === null) {
    return {
      error: `Set_id '${setId}' exists but has no associated owner.`,
    }
  }

  if (!approvedOwners.includes(owner)) {
    return {
      error: `Set_id '${setId}' is associated with owner '${owner}', which is none of the currently supported SPs.`,
    }
  }

  return { ownerAddress: owner }
}
