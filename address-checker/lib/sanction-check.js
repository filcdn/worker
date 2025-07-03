import { isValidEthereumAddress } from '../../retriever/lib/address.js'

/**
 * Check a list of Ethereum addresses against the Chainalysis API
 * 
 * @param {string[]} addresses Array of Ethereum addresses to check
 * @param {string} apiKey Chainalysis API key
 * @returns {Promise<Array<{address: string, status: 'sanctioned'|'approved'|'pending'}>}
 */
export async function checkAddresses(addresses, apiKey) {
    // Filter out any invalid addresses
    const validAddresses = addresses.filter(isValidEthereumAddress)

    if (validAddresses.length === 0) {
        return []
    }

    // Process in batches to avoid hitting API rate limits
    const batchSize = 25 // Adjust based on Chainalysis API batch limits
    const results = []

    for (let i = 0; i < validAddresses.length; i += batchSize) {
        const batch = validAddresses.slice(i, i + batchSize)
        const batchResults = await processAddressBatch(batch, apiKey)
        results.push(...batchResults)

        // Add a small delay between batches to respect API rate limits
        if (i + batchSize < validAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 1000))
        }
    }

    return results
}

/**
 * Process a batch of addresses with the Chainalysis API
 * 
 * @param {string[]} addresses Batch of addresses to check
 * @param {string} apiKey Chainalysis API key
 * @returns {Promise<Array<{address: string, status: 'sanctioned'|'approved'|'pending'}>}
 */
async function processAddressBatch(addresses, apiKey) {
    try {
        const url = 'https://api.chainalysis.com/api/risk/v1/ethereum/addresses'

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ addresses })
        })

        if (!response.ok) {
            console.error(`Chainalysis API error: ${response.status} ${response.statusText}`)
            // Mark all addresses as pending if the request fails
            return addresses.map(address => ({
                address,
                status: 'pending'
            }))
        }

        const data = await response.json()

        // Process the response for each address
        return addresses.map(address => {
            const addressData = data[address] || {}

            // Map Chainalysis response to our internal status format
            const isSanctioned = addressData.risk?.category === 'sanctions' ||
                (addressData.identifications &&
                    addressData.identifications.some(id => id.category === 'sanctions'))

            return {
                address,
                status: isSanctioned ? 'sanctioned' : 'approved'
            }
        })
    } catch (error) {
        console.error('Error checking addresses:', error)
        // Mark all addresses as pending if there's an exception
        return addresses.map(address => ({
            address,
            status: 'pending'
        }))
    }
}
