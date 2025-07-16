import { fetchAndStoreBadBits } from '../lib/bad-bits.js'

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    await this.scheduled(undefined, env, ctx)
    return new Response('Bad bits updated successfully', {
      status: 200,
    })
  },

  async scheduled(_controller, env, _ctx) {
    console.log('Running scheduled bad bits update...')
    try {
      await fetchAndStoreBadBits(env)
      console.log('Updated bad bits denylist')
    } catch (error) {
      console.error('Failed to update bad bits denylist:', error)
      throw error
    }
  },
}
