/**
 * Parse params found in path of the request URL
 *
 * @param {Request} request
 * @param {object} options
 * @param {string} options.DNS_ROOT
 * @returns {{
 *   clientWalletAddress?: string
 *   rootCid?: string
 *   error?: string
 * }}
 */
export function parseRequest(request, { DNS_ROOT }) {
  const url = new URL(request.url)
  console.log({ msg: 'retrieval request', DNS_ROOT, url })

  if (!url.hostname.endsWith(DNS_ROOT)) {
    return {
      error: `Invalid hostname: ${url.hostname}. It must end with ${DNS_ROOT}.`,
    }
  }
  const clientWalletAddress = url.hostname.slice(0, -DNS_ROOT.length)

  const [rootCid] = url.pathname.split('/').filter(Boolean)
  if (!rootCid) {
    return { error: 'Missing required path element: `/{CID}`' }
  }

  if (!rootCid.startsWith('baga')) {
    return { error: `Invalid CID: ${rootCid}. It is not a valid CommP root.` }
  }

  return { clientWalletAddress, rootCid }
}
