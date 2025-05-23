/**
 * Parse params found in path of the request URL
 *
 * @param {Request} request
 * @returns {{proofSetId?: string, pieceCid?: string}}
 */
export function parseRequest (request) {
  const url = new URL(request.url)
  const [proofSetId, pieceCid] = url.pathname.split('/').filter(Boolean)

  return { proofSetId, pieceCid }
}
