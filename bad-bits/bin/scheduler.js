import { fetchAndStoreBadBits } from '../lib/badbits.js'

export default {
  async scheduled(_controller, env, _ctx) {
    console.log('Running scheduled badbits update...')
    try {
      const result = await fetchAndStoreBadBits(env)
      console.log(
        `Updated badbits denylist: ${result.added} added, ${result.removed} removed`,
      )
    } catch (error) {
      console.error('Failed to update badbits denylist:', error)
      throw error
    }
  },
}
