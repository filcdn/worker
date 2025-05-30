/**
 * Retrieves the file under the pieceCID from the constructed URL.
 *
 * @param {string} baseUrl - The base URL to storage provider serving the piece.
 * @param {string} pieceCid - The CID of the piece to retrieve.
 * @param {number} [cacheTtl=86400] - Cache TTL in seconds (default: 86400).
 *   Default is `86400`
 * @returns {Promise<{
 *   response: Response
 *   cacheMiss: null | boolean
 *   contentLength: null | string
 * }>}
 *   - The response from the fetch request, the cache miss and the content length.
 */
export async function retrieveFile(baseUrl, pieceCid, cacheTtl = 86400) {
  const url = `https://${baseUrl}/piece/${pieceCid}`
  const response = await fetch(url, {
    cf: {
      cacheTtlByStatus: {
        '200-299': cacheTtl,
        404: 0,
        '500-599': 0,
      },
      cacheEverything: true,
    },
  })
  const cacheStatus = response.headers.get('CF-Cache-Status')
  if (!cacheStatus) {
    console.log(`CF-Cache-Status was not provided for ${url}`)
  }

  const cacheMiss = cacheStatus !== 'HIT'

  const contentLength = response.headers.get('Content-Length')
  if (!contentLength && contentLength !== '0') {
    console.log(`Content-Length was not provided for ${url}`)
  }

  return { response, cacheMiss, contentLength }
}
