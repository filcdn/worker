/**
 * Get all unique addresses that need to be checked from the database
 * 
 * @param {Object} env Environment with DB binding
 * @returns {Promise<string[]>} Array of Ethereum addresses
 */
export async function getAddressesToCheck(env) {
  // Get all unique payers and payees from indexer_proof_set_rails
  const statement = env.DB.prepare(`
    SELECT DISTINCT payer as address FROM indexer_proof_set_rails
    UNION
    SELECT DISTINCT payee as address FROM indexer_proof_set_rails
  `)
  
  const { results } = await statement.all()
  
  // Extract addresses from the results
  return results.map(row => row.address)
}

/**
 * Update the sanction status for multiple addresses
 * 
 * @param {Object} env Environment with DB binding
 * @param {Array<{address: string, status: string}>} addressResults Results from sanction check
 * @returns {Promise<void>}
 */
export async function updateAddressStatuses(env, addressResults) {
  // Use a transaction for better performance and atomicity
  const batch = []
  
  for (const { address, status } of addressResults) {
    batch.push(
      env.DB.prepare(`
        INSERT INTO address_sanction_check (address, status, last_checked)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (address) DO UPDATE
        SET status = ?, last_checked = CURRENT_TIMESTAMP
      `).bind(address, status, status)
    )
  }
  
  if (batch.length > 0) {
    await env.DB.batch(batch)
  }
}

/**
 * Get the sanction status for a specific address
 * 
 * @param {Object} env Environment with DB binding
 * @param {string} address Ethereum address to check
 * @returns {Promise<string|null>} Sanction status or null if not found
 */
export async function getAddressStatus(env, address) {
  const result = await env.DB.prepare(`
    SELECT status FROM address_sanction_check
    WHERE address = ?
    LIMIT 1
  `).bind(address.toLowerCase()).first()
  
  return result ? result.status : null
}