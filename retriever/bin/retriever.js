import assert from 'node:assert'
import { isValidEthereumAddress } from '../lib/address.js'
import { parseRequest } from '../lib/request.js'
import {
  retrieveFile as defaultRetrieveFile,
  measureStreamedEgress,
} from '../lib/retrieval.js'
import { getOwnerByRootCid, logRetrievalResult } from '../lib/store.js'

// Hardcoded base URL for the file retrieval
/** @type {Record<string, string>} */
const OWNER_TO_URL = {
  '0x2A06D234246eD18b6C91de8349fF34C22C7268e8': 'http://pdp.660688.xyz:8443',
  '0x12191de399B9B3FfEB562861f9eD62ea8da18AE5': 'https://techx-pdp.filecoin.no',
  '0x4A628ebAecc32B8779A934ebcEffF1646F517756': 'https://pdp.zapto.org',
  '0x9f5087a1821eb3ed8a137be368e5e451166efaae': 'https://yablu.net',
  '0xCb9e86945cA31E6C3120725BF0385CBAD684040c':
    'https://caliberation-pdp.infrafolio.com',
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @param {object} options
   * @param {typeof defaultRetrieveFile} [options.retrieveFile]
   * @returns
   */
  async fetch(request, env, ctx, { retrieveFile = defaultRetrieveFile } = {}) {
    const requestTimestamp = new Date().toISOString()
    const workerStartedAt = performance.now()
    const requestCountryCode = request.headers.get('CF-IPCountry')
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const {
      clientWalletAddress,
      rootCid,
      error: parsingError,
    } = parseRequest(request, env)
    if (parsingError) {
      console.error(parsingError)
      return new Response(parsingError, { status: 400 })
    }

    if (!clientWalletAddress || !rootCid) {
      return new Response('Missing required fields', { status: 400 })
    }

    if (!isValidEthereumAddress(clientWalletAddress)) {
      return new Response(
        `Invalid address: ${clientWalletAddress}. Address must be a valid ethereum address.`,
        { status: 400 },
      )
    }

    // Timestamp to measure file retrieval performance (from cache and from SP)
    const fetchStartedAt = performance.now()
    const { ownerAddress, error: ownerLookupError } = await getOwnerByRootCid(
      env,
      rootCid,
    )
    if (ownerLookupError) {
      console.error(ownerLookupError)
      return new Response(ownerLookupError, { status: 404 })
    }
    assert.ok(ownerAddress, 'Owner address must be defined')
    if (!Object.prototype.hasOwnProperty.call(OWNER_TO_URL, ownerAddress)) {
      return new Response(
        `No PDP URL configured for owner address: ${ownerAddress}`,
        { status: 404 },
      )
    }
    const spURL = OWNER_TO_URL[ownerAddress]
    const { response, cacheMiss } = await retrieveFile(
      spURL,
      rootCid,
      env.CACHE_TTL,
    )

    const retrievalResultEntry = {
      ownerAddress,
      clientAddress: clientWalletAddress,
      cacheMiss,
      egressBytes: null, // Will be populated later
      responseStatus: response.status,
      timestamp: requestTimestamp,
      performanceStats: {
        fetchTtfb: null, // Will be populated later
        workerTtfb: null, // Will be populated later
      },
      requestCountryCode,
    }

    if (!response.body) {
      // The upstream response does not have any readable body
      // There is no need to measure response body size, we can
      // return the original response object.
      const firstByteAt = performance.now()
      ctx.waitUntil(
        logRetrievalResult(env, {
          ...retrievalResultEntry,
          egressBytes: 0, // No body to measure
          performanceStats: {
            fetchTtfb: firstByteAt - fetchStartedAt,
            workerTtfb: firstByteAt - workerStartedAt,
          },
        }),
      )
      return response
    }

    // Stream and count bytes
    // We create two identical streams, one for the egress measurement and the other for returning the response as soon as possible
    const [returnedStream, egressMeasurementStream] = response.body.tee()
    const reader = egressMeasurementStream.getReader()
    const firstByteAt = performance.now()

    ctx.waitUntil(
      (async () => {
        const egressBytes = await measureStreamedEgress(reader)

        await logRetrievalResult(env, {
          ...retrievalResultEntry,
          egressBytes,
          performanceStats: {
            fetchTtfb: firstByteAt - fetchStartedAt,
            workerTtfb: firstByteAt - workerStartedAt,
          },
        })
      })(),
    )

    // Return immediately, proxying the transformed response
    return new Response(returnedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  },
}
