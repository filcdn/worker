import debug from 'debug'

/**
 * Retrieves the file under the pieceCID from the constructed URL.
 *
 * @param {string} baseUrl - The base URL to storage provider serving the piece.
 * @param {string} pieceCid - The CID of the piece to retrieve.
 * @param {number} [cacheTtl=86400] - Cache TTL in seconds (default: 86400).
 *   Default is `86400`
 * @returns {Promise<Response>, undefined | bool, undefined | number} - The
 *   response from the fetch request, the cache miss and the content length.
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
  let cacheMiss
  let contentLength
  if (!response.headers) {
    debug(
      'Response headers are not available for pieceCid=%s and hostname=%s',
      pieceCid,
      baseUrl,
    )
  } else {
    cacheMiss = response.headers.get('CF-Cache-Status') !== 'HIT'
    contentLength = response.headers.get('Content-Length')
  }
  return { response, cacheMiss, contentLength }
}
