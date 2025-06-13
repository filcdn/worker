import { httpAssert } from './http-assert.js'

/**
 * Parse params found in path of the request URL
 *
 * @param {Request} request
 * @param {object} options
 * @param {string} options.DNS_ROOT
 * @returns {{
 *   clientWalletAddress?: string
 *   rootCid?: string
 * }}
 */
export function parseRequest(request, { DNS_ROOT }) {
  const url = new URL(request.url)
  console.log('retrieval request', { DNS_ROOT, url })

  httpAssert(
    url.hostname.endsWith(DNS_ROOT),
    400,
    `Invalid hostname: ${url.hostname}. It must end with ${DNS_ROOT}.`,
  )

  const clientWalletAddress = url.hostname.slice(0, -DNS_ROOT.length)
  const [rootCid] = url.pathname.split('/').filter(Boolean)

  httpAssert(rootCid, 400, 'Missing required path element: `/{CID}`')
  httpAssert(
    rootCid.startsWith('baga'),
    400,
    `Invalid CID: ${rootCid}. It is not a valid CommP root.`,
  )

  return { clientWalletAddress, rootCid }
}
