import { MAX_EGRESS_PER_PROOF_SET } from '../../retriever/lib/constants.js'
import { CDN_PRICE_PER_TiB_PER_MONTH } from './constants.js'

/**
 * Calculates the total egress per owner for cache misses that occurred after a
 * specific timestamp by querying the retrieval_logs table directly
 *
 * @param {Env} env - Environment object containing database connection
 * @param {number} timestamp - Minimum timestamp to include in the calculation
 *   (Unix timestamp)
 * @returns {Promise<[{ owner: string; total_egress: number }]>} - Promise
 *   resolving to an object with owner IDs as keys and their total egress as
 *   values
 */
export async function sumEgressPerOwnerAfterTimestamp(env, timestamp) {
  // Initialize the query to sum egress grouped by owner_id
  const query = `
    SELECT owner, SUM(egress_bytes) as total_egress
    FROM retrieval_logs
    WHERE cache_miss = true AND timestamp >= ?
    GROUP BY owner
  `

  try {
    // Execute the query with the timestamp parameter
    const { results } = await env.DB.prepare(query).bind(timestamp).all()

    // Convert the results into the desired object format
    const egressByOwner = {}
    for (const row of results) {
      egressByOwner[row.owner_id] = Number(row.total_egress)
    }

    return egressByOwner
  } catch (error) {
    console.error(
      'Error querying retrieval_logs for egress calculation:',
      error,
    )
    throw new Error('Failed to calculate egress per owner: ' + error.message)
  }
}

/**
 * Calculates the maximum retrieval egress per owner by counting the number of
 * proof sets
 *
 * @param {Env} env - Environment object containing database connection
 * @returns {Promise<[{ owner: string; max_egress: number }]>} - Promise
 *   resolving to an object with owner IDs as keys and their maximum egress as
 *   values
 */
export async function calculateMaxRetrievalEgressPerOwner(env) {
  const query = `
      SELECT owner, COUNT(set_id) as set_count
      FROM indexer_proof_sets
      GROUP BY owner
    `

  try {
    const { results } = await env.DB.prepare(query).bind().all()

    // Convert the results into the desired object format
    const maxEgressPerOwner = {}
    for (const row of results) {
      maxEgressPerOwner[row.owner] = {
        max_egress:
          Number(row.set_count) * calculateMaxRetrievalEgressPerSetId(),
      }
    }

    return maxEgressPerOwner
  } catch (error) {
    console.error('Error querying indexer_proof_sets for owner counts:', error)
    throw new Error(
      'Failed to calculate proof sets per owner: ' + error.message,
    )
  }
}

/**
 * Calculates rewards per owner based on egress and maximum egress
 *
 * @param {[{ owner: string; egress: number }]} egressByOwner - Object with
 *   owner IDs as keys and their total egress as values
 * @param {[{ owner: string; max_egress: number }]} maxEgressPerOwner - Object
 *   with owner IDs as keys and their maximum egress as values
 * @returns {[{ owner: string; reward: number }]} - Object with owner IDs as
 *   keys and their rewards as values
 */
export function calculateRewardsPerOwner(egressByOwner, maxEgressPerOwner) {
  const rewardsByOwner = {}
  for (const { owner, egress } of egressByOwner) {
    const maxEgress = maxEgressPerOwner[owner]?.max_egress || 0
    const reward = (egress / maxEgress) * calculateFilCdnRewardsPerSetId()
    rewardsByOwner[owner] = { reward: Number.isNaN(reward) ? 0 : reward }
  }
  return rewardsByOwner
}

/**
 * Fetches current rewards for all owners where the records were updated at the
 * most recent timestamp using a single SQL query
 *
 * @param {Env} env - Environment object containing database connection
 * @returns {Promise<Object>} - Promise resolving to an object with owner
 *   addresses as keys and their rewards as values
 */
export async function getCurrentOwnerRewards(env) {
  try {
    // Use a single query with a subquery to find rewards updated at the maximum timestamp
    const query = `
        SELECT owner, rewards
        FROM owner
        WHERE rewards_calculated_at = (SELECT MAX(rewards_calculated_at) FROM owner_rewards)
      `

    const { results: ownerRewards } = await env.DB.prepare(query).bind().all()

    return ownerRewards
  } catch (error) {
    console.error('Error retrieving current owner rewards:', error)
    throw new Error(
      'Failed to retrieve current owner rewards: ' + error.message,
    )
  }
}

function calculateMaxRetrievalEgressPerSetId() {
  // TODO: This needs to be computed based on how much egress we want to serve per proofset per month
  return MAX_EGRESS_PER_PROOF_SET
}

function calculateFilCdnRewardsPerSetId() {
  // TODO: This needs to be computed based on how much filCDN is payed per TiB per month for a given proofset id
  return CDN_PRICE_PER_TiB_PER_MONTH
}
