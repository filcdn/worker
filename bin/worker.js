import { parseRequest } from '../lib/request.js'
import { retrieveFile as defaultRetrieveFile } from '../lib/retrieval.js'

// Hardcoded base URL for the file retrieval
// In the future either user should supply the base URL
// or worker should be retrieve database or chain
const BASE_URL = 'yablu.net'

export default {
  async fetch(request, env, ctx, { retrieveFile = defaultRetrieveFile } = {}) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const { clientWalletAddress, pieceCid, error } = parseRequest(request, env)
    if (error || !clientWalletAddress || !pieceCid) {
      return new Response(error ?? 'Missing required fields', { status: 400 })
    }

    // TODO: Record retrieval stats to D1 asynchronously (do not block response)
    return await retrieveFile(BASE_URL, pieceCid, env.CACHE_TTL)
  },
}
