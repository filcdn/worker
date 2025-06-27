import { updateProviderRSRScores } from '../lib/lib.js'

export default {
  async scheduled(_controller, env, _ctx) {
    console.info('Scheduled task started for scores calculation...')
    //TODO: Integration with the verifier contract
    await updateProviderRSRScores(env)
  },
}
