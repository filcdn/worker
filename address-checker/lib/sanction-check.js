import { isValidEthereumAddress } from '../../retriever/lib/address.js'

/**
 * Check a list of Ethereum addresses against the Chainalysis API
 * 
 * @param {string[]} addresses - Array of Ethereum addresses to check
 * @param {string} apiKey - Chainalysis API key
 * @param {Object} options - Additional options
 * @param {Function} [options.fetch] - Custom fetch function for testing
 * @returns {Promise<Array<{address: string, status: 'sanctioned'|'approved'|'pending'}>>}
 */
export async function checkAddresses(addresses, apiKey, { fetch = globalThis.fetch } = {}) {
    // Filter out any invalid addresses
    const validAddresses = addresses.filter(isValidEthereumAddress)

    if (validAddresses.length === 0) {
        return []
    }

    const results = []
    for (const address of validAddresses) {
        const sanctionCheck = await fetchChainalysisSanctions(address, apiKey, { fetch })
        results.push(sanctionCheck)
    }

    return results
}

/**
 * Check a single address with the Chainalysis API
 * 
 * @param {string} address - Ethereum address to check
 * @param {string} apiKey - Chainalysis API key
 * @param {Object} options - Additional options
 * @param {Function} [options.fetch] - Custom fetch function for testing
 * @returns {Promise<{address: string, status: 'sanctioned'|'approved'|'pending'}>}
 */
async function fetchChainalysisSanctions(address, apiKey, { fetch = globalThis.fetch } = {}) {
    try {
        const url = `https://public.chainalysis.com/api/v1/address/${address}`

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-API-KEY': apiKey,
                'Accept': 'application/json'
            }
        })

        if (!response.ok) {
            console.error(`Chainalysis API error: ${response.status} ${response.statusText}`)
            // Mark address as pending if the request fails
            return {
                address,
                status: 'pending'
            }
        }

        const data = await response.json()

        // If identifications array exists and is not empty, the address is sanctioned
        const isSanctioned = data.identifications &&
            data.identifications.length > 0

        return {
            address,
            status: isSanctioned ? 'sanctioned' : 'approved'
        }
    } catch (error) {
        console.error('Error checking address:', error)
        // Mark address as pending if there's an exception
        return {
            address,
            status: 'pending'
        }
    }
}
