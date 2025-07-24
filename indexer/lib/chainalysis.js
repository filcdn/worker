import { assertOkResponse } from 'assert-ok-response'

/**
 * Check a single address with the Chainalysis API
 *
 * @param {string} address - Ethereum address to check
 * @param {Object} options - Additional options
 * @param {Function} [options.fetch] - Custom fetch function for testing
 * @param {Function} [options.CHAINALYSIS_API_KEY] - Chainalysis API key
 * @returns {Promise<boolean | null>}
 */
export async function checkIfAddressIsSanctioned(
  address,
  { CHAINALYSIS_API_KEY, fetch = globalThis.fetch } = {},
) {
  const url = `https://public.chainalysis.com/api/v1/address/${address}`

  const response = await fetch(url, {
    headers: {
      'X-API-KEY': CHAINALYSIS_API_KEY,
      Accept: 'application/json',
    },
  })

  assertOkResponse(response)

  const data = await response.json()

  // If identifications array exists and is not empty, there exists a sanction for this address
  // We do not look into which sanctions are applied, just whether any exist
  return data.identifications && data.identifications.length > 0
}
