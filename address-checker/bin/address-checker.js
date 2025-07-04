import {
  addMissingAddresses,
  getAddressesToCheck,
  updateAddressStatuses,
} from '../lib/store.js'
import { checkAddresses } from '../lib/sanction-check.js'

export default {
  /**
   * Scheduled worker to check Ethereum addresses against the Chainalysis
   * sanctions API
   *
   * @param {ScheduledController} controller - Scheduled event controller
   * @param {Env} env - Environment variables and bindings
   * @param {ExecutionContext} ctx - Execution context
   * @param {Object} [options={}] - Additional options. Default is `{}`
   * @param {Function} [options.fetch=globalThis.fetch] - Custom fetch function
   *   for testing. Default is `globalThis.fetch`
   * @returns {Promise<void>}
   */
  async scheduled(controller, env, ctx, { fetch = globalThis.fetch } = {}) {
    try {
      // First, add missing addresses to the address_sanction_check table
      const addedCount = await addMissingAddresses(env)
      console.log(`Added ${addedCount} new addresses with 'pending' status`)

      // Get addresses with 'pending' status that need to be checked
      const pendingAddresses = await getAddressesToCheck(env)

      if (pendingAddresses.length === 0) {
        console.log('No pending addresses to check')
        return
      }

      console.log(
        `Checking ${pendingAddresses.length} pending addresses against Chainalysis API`,
      )

      // Check addresses against Chainalysis API, passing the fetch function
      const results = await checkAddresses(
        pendingAddresses,
        env.CHAINALYSIS_API_KEY,
        { fetch },
      )

      // Update database with results
      await updateAddressStatuses(env, results)

      console.log(
        `Address check completed: ${results.length} addresses processed`,
      )
    } catch (error) {
      console.error('Error in address checker worker:', error)
    }
  },
}
