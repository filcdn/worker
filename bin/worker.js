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

    const { response, cacheMiss, contentLength } = await retrieveFile(
      BASE_URL,
      pieceCid,
      env.CACHE_TTL,
    )
    ctx.waitUntil(
      logRetrievalResult(env, {
        ownerAddress: OWNER_ADDRESS_YABLU,
        clientAddress: clientWalletAddress,
        cacheMiss,
        contentLength,
        responseStatus: response.status,
        timestamp: new Date().toISOString(),
      }),
    )

    return response
  },
}
