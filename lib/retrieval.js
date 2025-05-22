/**
 * Fetches the file from the constructed URL with retries.
 * @param {string} baseUrl - The base URL.
 * @param {string} pieceCid - The CID to insert in the path.
 * @param {number} [cacheTtl=86400] - Cache TTL in seconds (default: 86400).
 * @returns {Promise<Uint8Array>} - The downloaded content as Uint8Array.
 */
export async function retrieveFile (baseUrl, pieceCid, cacheTtl = 86400) {
  const url = `https://${baseUrl}/piece/${pieceCid}`
  return fetch(url, {
    cf: {
      cacheTtl,
      cacheEverything: true
    }
  })
}
