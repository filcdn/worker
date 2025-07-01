import { isValidEthereumAddress } from '../lib/address.js'
import { OWNER_TO_RETRIEVAL_URL_MAPPING } from '../lib/constants.js'
import { parseRequest } from '../lib/request.js'
import {
  retrieveFile as defaultRetrieveFile,
  measureStreamedEgress,
} from '../lib/retrieval.js'
import {
  getOwnerAndValidateClient,
  getProviderUrl,
  logRetrievalResult,
} from '../lib/store.js'
import { httpAssert } from '../lib/http-assert.js'

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @param {object} options
   * @param {typeof defaultRetrieveFile} [options.retrieveFile]
   * @param {AbortSignal} [options.signal]
   * @returns
   */
  async fetch(
    request,
    env,
    ctx,
    { retrieveFile = defaultRetrieveFile, signal } = {},
  ) {
    try {
      return await this._fetch(request, env, ctx, { retrieveFile, signal })
    } catch (error) {
      return this._handleError(error)
    }
  },

  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @param {object} options
   * @param {AbortSignal} [options.signal]
   * @param {typeof defaultRetrieveFile} [options.retrieveFile]
   * @returns
   */
  async _fetch(
    request,
    env,
    ctx,
    { retrieveFile = defaultRetrieveFile, signal } = {},
  ) {
    const requestTimestamp = new Date().toISOString()
    const workerStartedAt = performance.now()
    const requestCountryCode = request.headers.get('CF-IPCountry')
    httpAssert(request.method === 'GET', 405, 'Method Not Allowed')

    const { clientWalletAddress, rootCid } = parseRequest(request, env)

    httpAssert(clientWalletAddress && rootCid, 400, 'Missing required fields')
    httpAssert(
      isValidEthereumAddress(clientWalletAddress),
      400,
      `Invalid address: ${clientWalletAddress}. Address must be a valid ethereum address.`,
    )

    // Timestamp to measure file retrieval performance (from cache and from SP)
    const fetchStartedAt = performance.now()

    const ownerAddress = await getOwnerAndValidateClient(
      env,
      clientWalletAddress,
      rootCid,
    )

    httpAssert(
      ownerAddress,
      404,
      `Unsupported Storage Provider (PDP ProofSet Owner): ${ownerAddress}`,
    )

    // Check the owner URL mapping
    let spURL
    if (
      Object.prototype.hasOwnProperty.call(
        OWNER_TO_RETRIEVAL_URL_MAPPING,
        ownerAddress,
      )
    ) {
      // If the owner is in the approved list, use the URL from the mapping
      spURL = OWNER_TO_RETRIEVAL_URL_MAPPING[ownerAddress].url
    } else {
      // Otherwise, look up the owner in the database
      spURL = await getProviderUrl(ownerAddress, env)
    }

    const { response, cacheMiss } = await retrieveFile(
      spURL,
      rootCid,
      env.CACHE_TTL,
      { signal },
    )

    const retrievalResultEntry = {
      ownerAddress,
      clientAddress: clientWalletAddress,
      cacheMiss,
      egressBytes: null, // Will be populated later
      responseStatus: response.status,
      timestamp: requestTimestamp,
      performanceStats: {
        fetchTtfb: null, // Will be populated later
        fetchTtlb: null, // Will be populated later
        workerTtfb: null, // Will be populated later
      },
      requestCountryCode,
    }

    if (!response.body) {
      // The upstream response does not have any readable body
      // There is no need to measure response body size, we can
      // return the original response object.
      const firstByteAt = performance.now()
      ctx.waitUntil(
        logRetrievalResult(env, {
          ...retrievalResultEntry,
          egressBytes: 0, // No body to measure
          performanceStats: {
            fetchTtfb: firstByteAt - fetchStartedAt,
            fetchTtlb: firstByteAt - fetchStartedAt,
            workerTtfb: firstByteAt - workerStartedAt,
          },
        }),
      )
      return response
    }

    // Stream and count bytes
    // We create two identical streams, one for the egress measurement and the other for returning the response as soon as possible
    const [returnedStream, egressMeasurementStream] = response.body.tee()
    const reader = egressMeasurementStream.getReader()
    const firstByteAt = performance.now()

    ctx.waitUntil(
      (async () => {
        const egressBytes = await measureStreamedEgress(reader)
        const lastByteFetchedAt = performance.now()

        await logRetrievalResult(env, {
          ...retrievalResultEntry,
          egressBytes,
          performanceStats: {
            fetchTtfb: firstByteAt - fetchStartedAt,
            fetchTtlb: lastByteFetchedAt - fetchStartedAt,
            workerTtfb: firstByteAt - workerStartedAt,
          },
        })
      })(),
    )

    // Return immediately, proxying the transformed response
    return new Response(returnedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  },

  /**
   * @param {unknown} error
   * @returns
   */
  _handleError(error) {
    const errHasStatus =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'

    const status = errHasStatus ? /** @type {number} */ (error.status) : 500

    const message =
      errHasStatus &&
      status < 500 &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : 'Internal Server Error'
    if (status >= 500) {
      console.error(error)
    }
    return new Response(message, { status })
  },
}
