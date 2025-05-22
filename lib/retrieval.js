/**
 * Fetches the file from the constructed URL with retries.
 * @param {string} baseUrl - The base URL.
 * @param {string} pieceCid - The CID to insert in the path.
 * @returns {Promise<Uint8Array>} - The downloaded content as Uint8Array.
 */
export async function retrieveFile (baseUrl, pieceCid) {
  const url = `https://${baseUrl}/piece/${pieceCid}`
  return fetch(url)
}
