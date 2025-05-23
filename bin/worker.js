import { retrieveFile as defaultRetrieveFile } from '../lib/retrieval.js'

// Hardcoded base URL for the file retrieval
// In the future either user should supply the base URL
// or worker should be retrieve database or chain
const BASE_URL = 'yablu.net'

export default {
  async fetch (request, env, ctx, { retrieveFile = defaultRetrieveFile } = {}) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const { proofSetId, pieceCid } = parseRequest(request)
    if (!proofSetId || !pieceCid) {
      return new Response('Missing required fields', { status: 400 })
    }

    let fetchResponse; let content; let success = false
    try {
      fetchResponse = await retrieveFile(BASE_URL, pieceCid, env.CACHE_TTL)

      if (fetchResponse.ok) {
        success = true
        content = await fetchResponse.arrayBuffer()
      }
    } catch (e) {
      console.error(`Failed to retrieve file: ${e}`)
    }

    // TODO: Record retrieval stats to D1 asynchronously (does not block response)
    if (success) {
      const headers = new Headers()
      headers.set('Content-Type', fetchResponse.headers.get('Content-Type') || 'application/octet-stream')
      headers.set('Cache-Control', 'public, max-age=86400') // 1 day
      return new Response(content, { status: 200, headers })
    } else {
      return new Response('Failed to fetch content', { status: 502 })
    }
  }
}

/**
 * Parse query parameters from the request URL
 *
 * @param {Request} request
 * @returns {{proofSetId: string; pieceCid: string;}}
 */
function parseRequest (request) {
  const url = new URL(request.url)
  const [proofSetId, pieceCid] = url.pathname.split('/').filter(Boolean)

  return { proofSetId, pieceCid }
}
