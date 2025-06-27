import { updateProviderRSRScores } from '../lib/lib.js'

export default {
  async scheduled(_controller, env, _ctx) {
    console.info('Scheduled task started for scores calculation...')
    //TODO: Implement the scores calculation logic and interaction with the verifier contract
    await updateProviderRSRScores(env)
  },
}
