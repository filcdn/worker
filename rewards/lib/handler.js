/**
 * @param {Env} env 
 * @returns 
 */
async function handleRewardsCalculation(env) {
    const owners = await env.DB.prepare(
        `SELECT owner_address FROM retrieval_logs DISTINCT`
    ).all();
    for (const owner of owners){
        const { last_rewards_calculated_at } = await env.DB.prepare(
            `SELECT last_rewards_calculated_at FROM owners WHERE owner_address = ?`
        ).bind(owner.owner_address).first() ?? { last_rewards_calculated_at: new Date().toISOString() };

        const { total_egress_bytes } = await env.DB.prepare(
            `SELECT SUM(egress_bytes) AS total_egress_bytes FROM retrieval_logs WHERE owner_address = ? AND timestamp >= ? AND cache_miss = 1`
        ).bind(owner.owner_address, last_rewards_calculated_at).first() ?? { total_egress_bytes: 0 };

        const rewards = total_egress_bytes / * MAXIMUM_PERCENT_REWARD
    }
}

export {
    handleRewardsCalculation
}