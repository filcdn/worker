import { parseRequest } from '../lib/request.js'
import { retrieveFile as defaultRetrieveFile } from '../lib/retrieval.js'
import { logRetrievalResult } from '../lib/store.js'

// Hardcoded base URL for the file retrieval
// In the future either user should supply the base URL
// or worker should be retrieve database or chain
const BASE_URL = 'yablu.net'
const OWNER_ADDRESS_YABLU = '0x7469b47e006d0660ab92ae560b27a1075eecf97f'
export default {
  async fetch(request, env, ctx, { retrieveFile = defaultRetrieveFile } = {}) {
    const performances = {}
    // Timestamp to measure overall worker execution time
    const t0 = performance.now()
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

    // Timestamp to measure file retrieval performance
    const t1 = performance.now()
    const response = await retrieveFile(BASE_URL, pieceCid, env.CACHE_TTL)
    performances.ttfb = performance.now() - t0
    performances.workerExecution = performance.now() - t1

    ctx.waitUntil(
      logRetrievalResult(env, {
        ownerAddress: OWNER_ADDRESS_YABLU,
        clientAddress: clientWalletAddress,
        response,
        timestamp:new Date().toISOString(),
        performances
      }),
    )
    return response
  },
}
