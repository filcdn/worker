import { fetchAndStoreBadBits } from '../lib/bad-bits.js'

export default {
  async scheduled(_controller, env, _ctx) {
    console.log('Running scheduled bad bits update...')
    try {
      await fetchAndStoreBadBits(env)
      console.log('Updated bad bits denylist')
    } catch (error) {
      console.error('Failed to update badbits denylist:', error)
      throw error
    }
  },
}
