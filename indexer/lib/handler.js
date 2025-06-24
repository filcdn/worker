/**
 * Handles the /provider-registered webhook
 *
 * @param {Env} env
 * @param {string} provider
 * @param {string} pdpUrl
 * @returns {Promise<Response>}
 */
export async function handleProviderRegistered(env, provider, pdpUrl) {
  if (
    !provider ||
    typeof provider !== 'string' ||
    !pdpUrl ||
    typeof pdpUrl !== 'string'
  ) {
    console.error('Invalid provider registered payload', { provider, pdpUrl })
    return new Response('Bad Request', { status: 400 })
  }

  console.log(`Provider registered (provider=${provider}, pdpUrl=${pdpUrl})`)

  await env.DB.prepare(
    `
        INSERT INTO owner_urls (
          owner,
          url
        )
        VALUES (?, ?)
        ON CONFLICT(owner) DO UPDATE SET url=excluded.url
      `,
  )
    .bind(provider.toLowerCase(), pdpUrl)
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
  if (!provider || typeof provider !== 'string') {
    console.error('Invalid provider removed payload', { provider })
    return new Response('Bad Request', { status: 400 })
  }

  console.log(`Provider removed (provider=${provider})`)

  /** @type {D1Result<Record<string, unknown>>} */
  const result = await env.DB.prepare(`DELETE FROM owner_urls WHERE owner = ?`)
    .bind(provider.toLowerCase())
    .run()

  // SQLite-specific: result.changes may indicate rows affected
  if (result.meta.changes === 0) {
    return new Response('Provider Not Found', { status: 404 })
  }

  return new Response('OK', { status: 200 })
}
