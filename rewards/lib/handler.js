import { calculateMaxRetrievalEgressPerOwner } from './utils.js'
import { sumEgressPerOwnerAfterTimestamp,calculateRewardsPerOwner,getOwnerRewards } from './utils.js'
import { updateOwnerRewards } from './store.js'

/**
 * @param {Env} env 
 * @returns 
 */
export async function handleRewardsCalculation(env) {
   const egressByOwner = await sumEgressPerOwnerAfterTimestamp(env, new Date().toISOString())
   const maxEgressPerOwner = await calculateMaxRetrievalEgressPerOwner(env)
   const rewardsPerOwner = calculateRewardsPerOwner(egressByOwner, maxEgressPerOwner)
   await updateOwnerRewards(env, rewardsPerOwner)
   return new Response('Rewards calculation completed successfully', { status: 200 })
}

/**
 * @param {Env} env 
 * @returns 
 */
export async function handleFetchOwnerRewards(env) {
  const rewardsPerOwner = await getOwnerRewards(env)
  return new Response(JSON.stringify(rewardsPerOwner), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}