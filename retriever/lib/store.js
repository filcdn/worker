import { OWNER_TO_RETRIEVAL_URL_MAPPING } from './constants.js'
import { httpAssert } from './http-assert.js'

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
  console.log('retrieval log', params)
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
 * @param {string} clientAddress - The address of the client making the request
 * @param {string} rootCid - The root CID to look up
 * @returns {Promise<string>} - The result containing either the approved owner
 *   address or a descriptive error
 */
export async function getOwnerAndValidateClient(env, clientAddress, rootCid) {
  const approvedOwners = Object.keys(OWNER_TO_RETRIEVAL_URL_MAPPING).map(
    (owner) => owner.toLowerCase(),
  )

  const query = `
   SELECT ir.set_id, lower(ips.owner) as owner, ipsr.payer, ipsr.with_cdn
   FROM indexer_roots ir
   LEFT OUTER JOIN indexer_proof_sets ips
     ON ir.set_id = ips.set_id
   LEFT OUTER JOIN indexer_proof_set_rails ipsr
     ON ir.set_id = ipsr.proof_set_id
   WHERE ir.root_cid = ?
 `

  const results = /**
   * @type {{
   *   owner: string
   *   set_id: string
   *   payer: string | undefined
   *   with_cdn: number | undefined
   * }[]}
   */ (
    /** @type {any[]} */ (
      (await env.DB.prepare(query).bind(rootCid).all()).results
    )
  )
  httpAssert(
    results && results.length > 0,
    404,
    `Root_cid '${rootCid}' does not exist or may not have been indexed yet.`,
  )

  const withOwner = results.filter((row) => row && row.owner != null)
  httpAssert(
    withOwner.length > 0,
    404,
    `Root_cid '${rootCid}' exists but has no associated owner.`,
  )

  const approved = withOwner.filter((row) => approvedOwners.includes(row.owner))
  httpAssert(
    approved.length > 0,
    404,
    `Root_cid '${rootCid}' exists but has no approved owner.`,
  )

  const withPaymentRail = approved.filter(
    (row) => row.payer && row.payer.toLowerCase() === clientAddress,
  )
  httpAssert(
    withPaymentRail.length > 0,
    402,
    `There is no payment rail for client '${clientAddress}' and root_cid '${rootCid}'.`,
  )

  const withCDN = withPaymentRail.filter(
    (row) => row.with_cdn && row.with_cdn === 1,
  )
  httpAssert(
    withCDN.length > 0,
    402,
    `The payment rail for client '${clientAddress}' and root_cid '${rootCid}' has withCDN=false.`,
  )

  const { set_id: setId, owner } = withCDN[0]

  console.log(
    `Looked up set_id '${setId}' and owner '${owner}' for root_cid '${rootCid}' and client '${clientAddress}'`,
  )

  return owner
}
