import { isValidEthereumAddress } from '../../retriever/lib/address'
import validator from 'validator'
import { PapertrailLogger } from '../../telemetry/papertrail'

/**
 * Handles the /provider-registered webhook
 *
 * @param {Env} env
 * @param {string} provider
 * @param {string} pieceRetrievalUrl
 * @param {object} options
 * @param {PapertrailLogger | Console} [options.logger] - An optional logger instance
 * @returns {Promise<Response>}
 */
export async function handleProviderRegistered(
  env,
  provider,
  pieceRetrievalUrl,
  { logger = console } = {},
) {
  if (
    !provider ||
    typeof provider !== 'string' ||
    !pieceRetrievalUrl ||
    typeof pieceRetrievalUrl !== 'string' ||
    !isValidEthereumAddress(provider)
  ) {
    logger.error('Invalid provider registered payload', {
      provider,
      pieceRetrievalUrl,
    })
    return new Response('Bad Request', { status: 400 })
  }

  if (!validator.isURL(pieceRetrievalUrl)) {
    logger.error('Invalid Piece Retrieval URL', { pieceRetrievalUrl })
    return new Response('Bad Request', { status: 400 })
  }

  logger.log(
    `Provider registered (provider=${provider}, pieceRetrievalUrl=${pieceRetrievalUrl})`,
  )

  await env.DB.prepare(
    `
        INSERT INTO provider_urls (
          address,
          piece_retrieval_url
        )
        VALUES (?, ?)
        ON CONFLICT(address) DO UPDATE SET piece_retrieval_url=excluded.piece_retrieval_url
      `,
  )
    .bind(provider.toLowerCase(), pieceRetrievalUrl)
    .run()

  return new Response('OK', { status: 200 })
}

/**
 * Handles the /provider-removed webhook
 *
 * @param {Env} env
 * @param {string} provider
 * @param {object} options
 * @param {PapertrailLogger | Console } [options.logger] - An optional logger instance
 * @returns {Promise<Response>}
 */
export async function handleProviderRemoved(env, provider, { logger = console } = {}) {
  if (
    !provider ||
    typeof provider !== 'string' ||
    !isValidEthereumAddress(provider)
  ) {
    logger.error('Invalid provider removed payload', { provider })
    return new Response('Bad Request', { status: 400 })
  }

  logger.log(`Provider removed (provider=${provider})`)

  /** @type {D1Result<Record<string, unknown>>} */
  const result = await env.DB.prepare(
    `DELETE FROM provider_urls WHERE address = ?`,
  )
    .bind(provider.toLowerCase())
    .run()

  // SQLite-specific: result.changes may indicate rows affected
  if (result.meta.changes === 0) {
    return new Response('Provider Not Found', { status: 404 })
  }

  return new Response('OK', { status: 200 })
}
