/**
 * Retrieves the file under the pieceCID from the constructed URL.
 *
 * @param {string} baseUrl - The base URL to storage provider serving the piece.
 * @param {string} pieceCid - The CID of the piece to retrieve.
 * @param {number} [cacheTtl=86400] - Cache TTL in seconds (default: 86400).
 * @returns {Promise<Response>} - The response from the fetch request.
 */
export async function retrieveFile (baseUrl, pieceCid, cacheTtl = 86400) {
  const url = `https://${baseUrl}/piece/${pieceCid}`
  return fetch(url, {
    cf: {
      cacheTtlByStatus: {
        '200-299': cacheTtl,
        404: 0,
        '500-599': 0
      },
      cacheEverything: true
    }
  })
}
