import { isValidEthereumAddress } from '../lib/address.js'
import { parseRequest } from '../lib/request.js'
import {
  retrieveFile as defaultRetrieveFile,
  measureStreamedEgress,
} from '../lib/retrieval.js'
import { logRetrievalResult } from '../lib/store.js'

// Hardcoded base URL for the file retrieval
// In the future either user should supply the base URL
// or worker should be retrieve database or chain
const BASE_URL = 'yablu.net'
const OWNER_ADDRESS_YABLU = '0x7469b47e006d0660ab92ae560b27a1075eecf97f'
export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @param {object} options
   * @param {typeof defaultRetrieveFile} [options.retrieveFile]
   * @returns
   */
  async fetch(request, env, ctx, { retrieveFile = defaultRetrieveFile } = {}) {
    const requestTimestamp = new Date().toISOString()
    const workerStartedAt = performance.now()
    const requestCountryCode = request.headers.get('CF-IPCountry')
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const { clientWalletAddress, pieceCid, error } = parseRequest(request, env)
    if (error) {
      console.error(error)
      return new Response(error, { status: 400 })
    }

    if (!clientWalletAddress || !pieceCid) {
      return new Response('Missing required fields', { status: 400 })
    }

    if (!isValidEthereumAddress(clientWalletAddress)) {
      return new Response(
        `Invalid address: ${clientWalletAddress}. Address must be a valid ethereum address.`,
        { status: 400 },
      )
    }

    // Timestamp to measure file retrieval performance (from cache and from SP)
    const fetchStartedAt = performance.now()

    const { response, cacheMiss } = await retrieveFile(
      BASE_URL,
      pieceCid,
      env.CACHE_TTL,
    )

    const retrievalResultEntry = {
      ownerAddress: OWNER_ADDRESS_YABLU,
      clientAddress: clientWalletAddress,
      cacheMiss,
      egressBytes: null, // Will be populated later
      responseStatus: response.status,
      timestamp: requestTimestamp,
      performanceStats: {
        fetchTtfb: null, // Will be populated later
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

        await logRetrievalResult(env, {
          ...retrievalResultEntry,
          egressBytes,
          performanceStats: {
            fetchTtfb: firstByteAt - fetchStartedAt,
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
}
