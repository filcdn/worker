import { isValidEthereumAddress } from '../lib/address.js'
import { parseRequest } from '../lib/request.js'
import {
  retrieveFile as defaultRetrieveFile,
  measureStreamedEgress,
} from '../lib/retrieval.js'
import { getOwnerAndValidateClient, logRetrievalResult } from '../lib/store.js'
import { httpAssert } from '../lib/http-assert.js'
import { setContentSecurityPolicy } from '../lib/content-security-policy.js'
import { findInBadBits } from '../lib/bad-bits-util.js'

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @param {object} options
   * @param {typeof defaultRetrieveFile} [options.retrieveFile]
   * @param {AbortSignal} [options.signal]
   * @returns
   */
  async fetch(
    request,
    env,
    ctx,
    { retrieveFile = defaultRetrieveFile, signal } = {},
  ) {
    try {
      return await this._fetch(request, env, ctx, { retrieveFile, signal })
    } catch (error) {
      return this._handleError(error)
    }
  },

  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @param {object} options
   * @param {AbortSignal} [options.signal]
   * @param {typeof defaultRetrieveFile} [options.retrieveFile]
   * @returns
   */
  async _fetch(
    request,
    env,
    ctx,
    { retrieveFile = defaultRetrieveFile, signal } = {},
  ) {
    httpAssert(
      ['GET', 'HEAD'].includes(request.method),
      405,
      'Method Not Allowed',
    )
    if (URL.parse(request.url)?.pathname === '/') {
      return Response.redirect('https://filcdn.com/', 302)
    }

    const requestTimestamp = new Date().toISOString()
    const workerStartedAt = performance.now()
    const requestCountryCode = request.headers.get('CF-IPCountry')

    const { clientWalletAddress, rootCid } = parseRequest(request, env)

    httpAssert(clientWalletAddress && rootCid, 400, 'Missing required fields')
    httpAssert(
      isValidEthereumAddress(clientWalletAddress),
      400,
      `Invalid address: ${clientWalletAddress}. Address must be a valid ethereum address.`,
    )

    try {
      // Timestamp to measure file retrieval performance (from cache and from SP)
      const fetchStartedAt = performance.now()

      const [{ ownerAddress, pieceRetrievalUrl, proofSetId }, isBadBit] =
        await Promise.all([
          getOwnerAndValidateClient(env, clientWalletAddress, rootCid),
          findInBadBits(env, rootCid),
        ])

      httpAssert(
        !isBadBit,
        404,
        'The requested CID was flagged by the Bad Bits Denylist at https://badbits.dwebops.pub',
      )

      httpAssert(
        ownerAddress,
        404,
        `Unsupported Storage Provider (PDP ProofSet Owner): ${ownerAddress}`,
      )

      const { response: originResponse, cacheMiss } = await retrieveFile(
        pieceRetrievalUrl,
        rootCid,
        env.CACHE_TTL,
        { signal },
      )

      if (!originResponse.body) {
        ctx.waitUntil(
          logRetrievalResult(env, {
            clientAddress: clientWalletAddress,
            ownerAddress,
            cacheMiss,
            responseStatus: originResponse.status,
            egressBytes: 0,
            requestCountryCode,
            timestamp: requestTimestamp,
          }),
        )
        const response = new Response(originResponse.body, originResponse)
        setContentSecurityPolicy(response)
        response.headers.set('X-Proof-Set-ID', proofSetId)
        return response
      }

      const [returnedStream, egressMeasurementStream] =
        originResponse.body.tee()
      const reader = egressMeasurementStream.getReader()
      const firstByteAt = performance.now()

      ctx.waitUntil(
        (async () => {
          const egressBytes = await measureStreamedEgress(reader)
          const lastByteFetchedAt = performance.now()

          await logRetrievalResult(env, {
            clientAddress: clientWalletAddress,
            ownerAddress,
            cacheMiss,
            responseStatus: originResponse.status,
            egressBytes,
            requestCountryCode,
            timestamp: requestTimestamp,
            performanceStats: {
              fetchTtfb: firstByteAt - fetchStartedAt,
              fetchTtlb: lastByteFetchedAt - fetchStartedAt,
              workerTtfb: firstByteAt - workerStartedAt,
            },
          })
        })(),
      )

      // Return immediately, proxying the transformed response
      const response = new Response(returnedStream, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: originResponse.headers,
      })
      setContentSecurityPolicy(response)
      response.headers.set('X-Proof-Set-ID', proofSetId)
      return response
    } catch (error) {
      const { status } = getErrorHttpStatusMessage(error)

      ctx.waitUntil(
        logRetrievalResult(env, {
          clientAddress: clientWalletAddress,
          ownerAddress: null,
          cacheMiss: null,
          responseStatus: status,
          egressBytes: null,
          requestCountryCode,
          timestamp: requestTimestamp,
        }),
      )

      throw error
    }
  },

  /**
   * @param {unknown} error
   * @returns
   */
  _handleError(error) {
    const { status, message } = getErrorHttpStatusMessage(error)

    if (status >= 500) {
      console.error(error)
    }
    return new Response(message, { status })
  },
}

/**
 * Extracts status and message from an error object.
 *
 * - If the error has a numeric `status`, it is used; otherwise, defaults to 500.
 * - If the status is < 500 and a string `message` exists, it's used; otherwise, a
 *   generic message is returned.
 *
 * @param {unknown} error - The error object to extract from.
 * @returns {{ status: number; message: string }}
 */
function getErrorHttpStatusMessage(error) {
  const isObject = typeof error === 'object' && error !== null
  const status =
    isObject && 'status' in error && typeof error.status === 'number'
      ? error.status
      : 500

  const message =
    isObject &&
    status < 500 &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message
      : 'Internal Server Error'

  return { status, message }
}
