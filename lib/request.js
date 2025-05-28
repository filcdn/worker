/**
 * Parse params found in path of the request URL
 *
 * @param {Request} request
 * @returns {{
 *   clientWalletAddress?: string
 *   pieceCid?: string
 *   error?: string
 * }}
 */
export function parseRequest(request, { DNS_ROOT }) {
  const url = new URL(request.url)
  console.log('DNS_ROOT: %s Requested url: %s', DNS_ROOT, url)

  if (!url.hostname.endsWith(DNS_ROOT)) {
    return {
      error: `Invalid hostname: ${url.hostname}. It must end with ${DNS_ROOT}.`,
    }
  }
  const clientWalletAddress = url.hostname.slice(0, -DNS_ROOT.length)

  const [pieceCid] = url.pathname.split('/').filter(Boolean)
  if (!pieceCid) {
    return { error: 'Missing required path element: `/{CommP}`' }
  }

  if (!pieceCid.startsWith('baga')) {
    return { error: `Invalid CID: ${pieceCid}. It is not a valid CommP root.` }
  }

  return { clientWalletAddress, pieceCid }
}
