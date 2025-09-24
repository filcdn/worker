import { httpAssert } from './http-assert.js'

/**
 * Logs the result of a file retrieval attempt to the D1 database.
 *
 * @param {Pick<Env, 'DB'>} env - Worker environment (contains D1 binding).
 * @param {object} params - Parameters for the retrieval log.
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
        response_status,
        egress_bytes,
        cache_miss,
        fetch_ttfb,
        fetch_ttlb,
        worker_ttfb,
        request_country_code,
        data_set_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        timestamp,
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
 * Retrieves the provider and data set id for a given root CID.
 *
 * @param {Pick<Env, 'DB'>} env - Cloudflare Worker environment with D1 DB
 *   binding
 * @param {string} payerAddress - The address of the client paying for the
 *   request
 * @param {string} pieceCid - The piece CID to look up
 * @returns {Promise<{
 *   serviceProviderId: string
 *   serviceUrl: string
 *   dataSetId: string
 * }>}
 */
export async function getStorageProviderAndValidatePayer(
  env,
  payerAddress,
  pieceCid,
) {
  const query = `
   SELECT pieces.data_set_id, data_sets.service_provider_id, data_sets.payer_address, data_sets.with_cdn, service_providers.service_url, wallet_details.is_sanctioned
   FROM pieces
   LEFT OUTER JOIN data_sets
     ON pieces.data_set_id = data_sets.id
   LEFT OUTER JOIN service_providers
     ON data_sets.service_provider_id = service_providers.id
   LEFT OUTER JOIN wallet_details
     ON data_sets.payer_address = wallet_details.address
   WHERE pieces.cid = ?
 `

  const results = /**
   * @type {{
   *   service_provider_id: string
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

  const withServiceProvider = results.filter(
    (row) => row && row.service_provider_id != null,
  )
  httpAssert(
    withServiceProvider.length > 0,
    404,
    `Piece_cid '${pieceCid}' exists but has no associated service provider.`,
  )

  const withPaymentRail = withServiceProvider.filter(
    (row) =>
      row.payer_address && row.payer_address.toLowerCase() === payerAddress,
  )
  httpAssert(
    withPaymentRail.length > 0,
    402,
    `There is no Filecoin Warm Storage Service deal for payer '${payerAddress}' and piece_cid '${pieceCid}'.`,
  )

  const withCDN = withPaymentRail.filter(
    (row) => row.with_cdn && row.with_cdn === 1,
  )
  httpAssert(
    withCDN.length > 0,
    402,
    `The Filecoin Warm Storage Service deal for payer '${payerAddress}' and piece_cid '${pieceCid}' has withCDN=false.`,
  )

  const withPayerNotSanctioned = withPaymentRail.filter(
    (row) => !row.is_sanctioned,
  )
  httpAssert(
    withPayerNotSanctioned.length > 0,
    403,
    `Wallet '${payerAddress}' is sanctioned and cannot retrieve piece_cid '${pieceCid}'.`,
  )

  const withApprovedProvider = withPayerNotSanctioned.filter(
    (row) => row.service_url,
  )
  httpAssert(
    withApprovedProvider.length > 0,
    404,
    `No approved service provider found for payer '${payerAddress}' and piece_cid '${pieceCid}'.`,
  )

  const {
    data_set_id: dataSetId,
    service_provider_id: serviceProviderId,
    service_url: serviceUrl,
  } = withApprovedProvider[0]

  // We need this assertion to supress TypeScript error. The compiler is not able to infer that
  // `withCDN.filter()` above returns only rows with `service_url` defined.
  httpAssert(serviceUrl, 500, 'should never happen')

  console.log(
    `Looked up Data set ID '${dataSetId}' and service provider id '${serviceProviderId}' for piece_cid '${pieceCid}' and payer '${payerAddress}'. Service URL: ${serviceUrl}`,
  )

  return { serviceProviderId, serviceUrl, dataSetId }
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
