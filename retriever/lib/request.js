import { httpAssert } from './http-assert.js'
/** @typedef {import('../../telemetry/papertrail.js').PapertrailLogger} PapertrailLogger */

/**
 * Parse params found in path of the request URL
 *
 * @param {Request} request
 * @param {object} options
 * @param {string} options.DNS_ROOT
 * @param {PapertrailLogger | Console} [options.logger]
 * @returns {{
 *   clientWalletAddress?: string
 *   rootCid?: string
 * }}
 */
export function parseRequest(request, { DNS_ROOT, logger = console }) {
  const url = new URL(request.url)
  logger.log('retrieval request', { DNS_ROOT, url })

  httpAssert(
    url.hostname.endsWith(DNS_ROOT),
    400,
    `Invalid hostname: ${url.hostname}. It must end with ${DNS_ROOT}.`,
  )

  const clientWalletAddress = url.hostname.slice(0, -DNS_ROOT.length)
  const [rootCid] = url.pathname.split('/').filter(Boolean)

  httpAssert(rootCid, 404, 'Missing required path element: `/{CID}`')
  httpAssert(
    rootCid.startsWith('baga'),
    404,
    `Invalid CID: ${rootCid}. It is not a valid CommP root.`,
  )

  return { clientWalletAddress, rootCid }
}
