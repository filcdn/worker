import { isValidEthereumAddress } from '../../retriever/lib/address.js'
import { checkAddresses } from '../lib/sanction-check.js'
import { getAddressesToCheck, updateAddressStatuses } from '../lib/store.js'

export default {
    async scheduled(event, env, ctx) {
        console.log('Running scheduled address sanctions check')

        try {
            // Get all unique addresses from the database
            const addresses = await getAddressesToCheck(env)

            if (addresses.length === 0) {
                console.log('No addresses to check')
                return
            }

            console.log(`Checking ${addresses.length} addresses against Chainalysis API`)

            // Check addresses against Chainalysis API using the API key from secrets
            const results = await checkAddresses(addresses, env.CHAINALYSIS_API_KEY)

            // Update database with results
            await updateAddressStatuses(env, results)

            console.log(`Address check completed: ${results.length} addresses processed`)
        } catch (error) {
            console.error('Error in scheduled address check:', error)
            throw error
        }
    }
}