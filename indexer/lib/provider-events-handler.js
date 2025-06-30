import { isValidEthereumAddress } from '../../retriever/lib/address'
import validator from 'validator'

/**
 * Handles the /provider-registered webhook
 *
 * @param {Env} env
 * @param {string} provider
 * @param {string} pieceRetrievalUrl
 * @returns {Promise<Response>}
 */
export async function handleProviderRegistered(
  env,
  provider,
  pieceRetrievalUrl,
) {
  if (
    !provider ||
    typeof provider !== 'string' ||
    !pieceRetrievalUrl ||
    typeof pieceRetrievalUrl !== 'string' ||
    !isValidEthereumAddress(provider)
  ) {
    console.error('Invalid provider registered payload', {
      provider,
      pieceRetrievalUrl,
    })
    return new Response('Bad Request', { status: 400 })
  }

  if (!validator.isURL(pieceRetrievalUrl)) {
    console.error('Invalid Piece Retrieval URL', { pieceRetrievalUrl })
    return new Response('Bad Request', { status: 400 })
  }

  console.log(
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
 * @returns {Promise<Response>}
 */
export async function handleProviderRemoved(env, provider) {
  if (
    !provider ||
    typeof provider !== 'string' ||
    !isValidEthereumAddress(provider)
  ) {
    console.error('Invalid provider removed payload', { provider })
    return new Response('Bad Request', { status: 400 })
  }

  console.log(`Provider removed (provider=${provider})`)

  /** @type {D1Result<Record<string, unknown>>} */
  const result = await env.DB.prepare(
    `DELETE FROM provider_urls WHERE address = ?`,
  )
    .bind(provider.toLowerCase())
    .run()

  return new Response('OK', { status: 200 })
}
