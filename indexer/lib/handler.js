/**
 * Handles the /provider-registered webhook
 * @param {Env} env
 * @param {string} provider
 * @param {string} pdpUrl
 * @returns {Promise<Response>}
 */
export async function handleProviderRegistered(env, provider, pdpUrl) {
    if (
      !provider || typeof provider !== 'string' ||
      !pdpUrl || typeof pdpUrl !== 'string'
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
      `
    )
      .bind(provider.toLowerCase(), pdpUrl)
      .run()
  
    return new Response('OK', { status: 200 })
  }
  