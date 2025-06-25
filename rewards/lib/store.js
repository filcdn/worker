/**
 * Updates owner amount in the database using Cloudflare D1's batch API
 *
 * @param {Object} env - Environment object containing D1 database connection
 * @param {Object} rewardsPerOwner - Object with owner addresses as keys and
 *   reward info as values
 * @returns {Promise<void>}
 */
export async function updateOwnerRewards(env, rewardsPerOwner) {
  const now = new Date().toISOString()
  const owners = Object.keys(rewardsPerOwner)

  if (owners.length === 0) return

  const statements = owners.map((owner) => {
    const reward = rewardsPerOwner[owner].reward
    return env.DB.prepare(
      `
        INSERT INTO owner_rewards (owner, amount, rewards_calculated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(owner) DO UPDATE SET
          amount = excluded.amount,
          rewards_calculated_at = excluded.rewards_calculated_at
      `,
    ).bind(owner, reward, now)
  })

  try {
    await env.DB.batch(statements)
    console.log(`Successfully updated amount for ${owners.length} owners`)
  } catch (error) {
    console.error('Error updating owner amount (batch):', error)
    throw new Error('Failed to update owner amount: ' + error.message)
  }
}
