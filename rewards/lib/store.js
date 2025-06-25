/**
 * Updates owner rewards in the database using a single batch transaction
 *
 * @param {Object} env - Environment object containing database connection
 * @param {Object} rewardsPerOwner - Object with owner IDs as keys and their
 *   reward info as values
 * @returns {Promise<void>}
 */
async function updateOwnerRewards(env, rewardsPerOwner) {
  const now = new Date().toISOString()
  try {
    // Start a transaction
    await env.DB.run('BEGIN TRANSACTION')

    // Prepare the statement once
    const stmt = env.DB.prepare(`
      INSERT INTO owner_rewards (owner_address, rewards, rewards_calculated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(owner_address) DO UPDATE SET rewards = excluded.rewards, rewards_calculated_at = excluded.rewards_calculated_at
    `)

    // Execute the statement for each owner
    for (const owner in rewardsPerOwner) {
      const reward = rewardsPerOwner[owner].reward
      await stmt.run([owner, reward, now])
    }

    // Finalize the prepared statement
    await stmt.finalize()

    // Commit the transaction
    await env.DB.run('COMMIT')

    console.log(
      `Successfully updated rewards for ${Object.keys(rewardsPerOwner).length} owners`,
    )
  } catch (error) {
    // Roll back the transaction in case of an error
    await env.DB.run('ROLLBACK')
    console.error('Error updating owner rewards:', error)
    throw new Error('Failed to update owner rewards: ' + error.message)
  }
}
