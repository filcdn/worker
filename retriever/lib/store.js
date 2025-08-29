import { httpAssert } from './http-assert.js'

/**
 * Logs the result of a file retrieval attempt to the D1 database.
 *
 * @param {Pick<Env, 'DB'>} env - Worker environment (contains D1 binding).
 * @param {object} params - Parameters for the retrieval log.
 * @param {string | null} params.storageProviderAddress - The storage provider's
 *   address.
 * @param {string} params.clientAddress - The client's address.
 * @param {number | null} params.egressBytes - The egress bytes of the response.
 * @param {number} params.responseStatus - The HTTP response status code.
 * @param {boolean | null} params.cacheMiss - Whether the retrieval was a cache
 *   miss.
 * @param {{
 *   fetchTtfb: number
 *   fetchTtlb: number
 *   workerTtfb: number
 * } | null} [params.performanceStats]
 *   - Performance statistics.
 *
 * @param {string} params.timestamp - The timestamp of the retrieval.
 * @param {string | null} params.requestCountryCode - The country code where the
 *   request originated from
 * @param {string | null} params.dataSetId - The data set ID associated with the
 *   retrieval
 * @returns {Promise<void>} - A promise that resolves when the log is inserted.
 */
export async function logRetrievalResult(env, params) {
  console.log('retrieval log', params)
  const {
    storageProviderAddress,
    clientAddress,
    cacheMiss,
    egressBytes,
    responseStatus,
    timestamp,
    performanceStats,
    requestCountryCode,
    dataSetId,
  } = params

  try {
    await env.DB.prepare(
      `
      INSERT INTO retrieval_logs (
        timestamp,
        storage_provider_address,
        client_address,
        response_status,
        egress_bytes,
        cache_miss,
        fetch_ttfb,
        fetch_ttlb,
        worker_ttfb,
        request_country_code,
        data_set_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        timestamp,
        storageProviderAddress,
        clientAddress,
        responseStatus,
        egressBytes,
        cacheMiss,
        performanceStats?.fetchTtfb ?? null,
        performanceStats?.fetchTtlb ?? null,
        performanceStats?.workerTtfb ?? null,
        requestCountryCode,
        dataSetId,
      )
      .run()
  } catch (error) {
    console.error(`Error inserting log: ${error}`)
    // TODO: Handle specific SQL error codes if needed
    throw error
  }
}

/**
 * Retrieves the owner address for a given root CID.
 *
 * @param {Pick<Env, 'DB'>} env - Cloudflare Worker environment with D1 DB
 *   binding
 * @param {string} clientAddress - The address of the client making the request
 * @param {string} pieceCid - The piece CID to look up
 * @returns {Promise<{
 *   storageProviderAddress: string
 *   serviceUrl: string
 *   dataSetId: string
 * }>}
 */
export async function getStorageProviderAndValidateClient(
  env,
  clientAddress,
  pieceCid,
) {
  const query = `
   SELECT pieces.data_set_id, data_sets.storage_provider_address, data_sets.payer_address, data_sets.with_cdn, providers.service_url, wallet_details.is_sanctioned
   FROM pieces
   LEFT OUTER JOIN data_sets
     ON pieces.data_set_id = data_sets.id
   LEFT OUTER JOIN providers
     ON data_sets.storage_provider_address = providers.beneficiary_address
   LEFT OUTER JOIN wallet_details
     ON data_sets.payer_address = wallet_details.address
   WHERE pieces.cid = ?
 `

  const results = /**
   * @type {{
   *   storage_provider_address: string
   *   data_set_id: string
   *   payer_address: string | undefined
   *   with_cdn: number | undefined
   *   service_url: string | undefined
   *   is_sanctioned: number | undefined
   * }[]}
   */ (
    /** @type {any[]} */ (
      (await env.DB.prepare(query).bind(pieceCid).all()).results
    )
  )
  httpAssert(
    results && results.length > 0,
    404,
    `Piece_cid '${pieceCid}' does not exist or may not have been indexed yet.`,
  )

  const withStorageProvider = results.filter(
    (row) => row && row.storage_provider_address != null,
  )
  httpAssert(
    withStorageProvider.length > 0,
    404,
    `Piece_cid '${pieceCid}' exists but has no associated storage provider.`,
  )

  const withPaymentRail = withStorageProvider.filter(
    (row) =>
      row.payer_address && row.payer_address.toLowerCase() === clientAddress,
  )
  httpAssert(
    withPaymentRail.length > 0,
    402,
    `There is no Filecoin Warm Storage Service deal for client '${clientAddress}' and piece_cid '${pieceCid}'.`,
  )

  const withCDN = withPaymentRail.filter(
    (row) => row.with_cdn && row.with_cdn === 1,
  )
  httpAssert(
    withCDN.length > 0,
    402,
    `The Filecoin Warm Storage Service deal for client '${clientAddress}' and piece_cid '${pieceCid}' has withCDN=false.`,
  )

  const withClientNotSanctioned = withPaymentRail.filter(
    (row) => !row.is_sanctioned,
  )
  httpAssert(
    withClientNotSanctioned.length > 0,
    403,
    `Wallet '${clientAddress}' is sanctioned and cannot retrieve piece_cid '${pieceCid}'.`,
  )

  const withApprovedProvider = withCDN.filter((row) => row.service_url)
  httpAssert(
    withApprovedProvider.length > 0,
    404,
    `No approved storage provider found for client '${clientAddress}' and piece_cid '${pieceCid}'.`,
  )

  const {
    data_set_id: dataSetId,
    storage_provider_address: storageProviderAddress,
    service_url: serviceUrl,
  } = withApprovedProvider[0]

  // We need this assertion to supress TypeScript error. The compiler is not able to infer that
  // `withCDN.filter()` above returns only rows with `service_url` defined.
  httpAssert(serviceUrl, 500, 'should never happen')

  console.log(
    `Looked up Data set ID '${dataSetId}' and storage provider address '${storageProviderAddress}' for piece_cid '${pieceCid}' and client '${clientAddress}'. Service URL: ${serviceUrl}`,
  )

  return { storageProviderAddress, serviceUrl, dataSetId }
}

/**
 * @param {Pick<Env, 'DB'>} env - Worker environment (contains D1 binding).
 * @param {object} params - Parameters for the data set update.
 * @param {string} params.dataSetId - The ID of the data set to update.
 * @param {number} params.egressBytes - The egress bytes used for the response.
 */
export async function updateDataSetStats(env, { dataSetId, egressBytes }) {
  await env.DB.prepare(
    `
    UPDATE data_sets
    SET total_egress_bytes_used = total_egress_bytes_used + ?
    WHERE id = ?
    `,
  )
    .bind(egressBytes, dataSetId)
    .run()
}
