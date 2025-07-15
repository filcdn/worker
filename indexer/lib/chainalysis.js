/**
 * Check a single address with the Chainalysis API
 *
 * @param {string} apiKey - Chainalysis API key
 * @param {string} address - Ethereum address to check
 * @param {Object} options - Additional options
 * @param {Function} [options.fetch] - Custom fetch function for testing
 * @returns {Promise<boolean | null>}
 */
export async function isAddressSanctioned(
  apiKey,
  address,
  { fetch = globalThis.fetch } = {},
) {
  try {
    const url = `https://public.chainalysis.com/api/v1/address/${address}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      console.error(
        `Chainalysis API error: ${response.status} ${response.statusText}`,
      )

      return null
    }

    const data = await response.json()

    // If identifications array exists and is not empty, there exists a sanction for this address
    // We do not look into which sanctions are applied, just whether any exist
    return data.identifications && data.identifications.length > 0
  } catch (error) {
    console.error('Error checking address:', error)
    return null
  }
}
