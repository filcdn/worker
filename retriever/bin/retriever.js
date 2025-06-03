import { parseRequest } from '../lib/request.js'
import { retrieveFile as defaultRetrieveFile } from '../lib/retrieval.js'
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

    // Timestamp to measure file retrieval performance (from cache and from SP)
    const fetchStartedAt = performance.now()

    const { response, cacheMiss, contentLength } = await retrieveFile(
      BASE_URL,
      pieceCid,
      env.CACHE_TTL,
    )

    const firstByteAt = performance.now()
    const fetchTtfb = firstByteAt - fetchStartedAt
    const workerTtfb = firstByteAt - workerStartedAt

    ctx.waitUntil(
      logRetrievalResult(env, {
        ownerAddress: OWNER_ADDRESS_YABLU,
        clientAddress: clientWalletAddress,
        cacheMiss,
        contentLength,
        responseStatus: response.status,
        timestamp: requestTimestamp,
        performanceStats: {
          fetchTtfb,
          workerTtfb,
        },
        requestCountryCode,
      }),
    )

    return response
  },
}
