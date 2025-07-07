import { fetchAndStoreBadBits } from '../lib/badbits.js'

export default {
  async scheduled(_controller, env, _ctx) {
    console.log('Running scheduled badbits update...')
    try {
      await fetchAndStoreBadBits(env)
      console.log('Updated badbits denylist')
    } catch (error) {
      console.error('Failed to update badbits denylist:', error)
    }
  },
}
