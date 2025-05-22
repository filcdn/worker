import { retrieveFile as defaultRetrieveFile } from '../lib/retrieval.js'

export default {
  async fetch (request, env, ctx, { retrieveFile = defaultRetrieveFile } = {}) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const { proofSetId, pieceCid, baseUrl } = parseSearchParams(request)
    if (!proofSetId || !pieceCid || !baseUrl) {
      return new Response('Missing required fields', { status: 400 })
    }

    let fetchResponse; let content; let success = false
    try {
      fetchResponse = await retrieveFile(baseUrl, pieceCid)

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
      return new Response(content, { status: 200, headers })
    } else {
      return new Response('Failed to fetch content', { status: 502 })
    }
  }
}

/**
 * Parse query parameters from the request URL
 * @param {Request} request
 * @returns {{proofSetId: string; pieceCid: string; baseUrl: string;}}
 */
function parseSearchParams (request) {
  const url = new URL(request.url)
  const proofSetId = url.searchParams.get('proofSetId')
  const pieceCid = url.searchParams.get('pieceCid')
  const baseUrl = url.searchParams.get('baseUrl')

  return { proofSetId, pieceCid, baseUrl }
}
