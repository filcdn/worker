/**
 * Get all addresses with 'pending' status that need to be checked
 * 
 * @param {Env} env - Environment with DB binding
 * @returns {Promise<string[]>} Array of Ethereum addresses with pending status
 */
export async function getAddressesToCheck(env) {
  // Only get addresses that have 'pending' status
  const statement = env.DB.prepare(`
    SELECT address FROM address_sanction_check 
    WHERE status = 'pending'
    LIMIT 10000
  `)

  const { results } = await statement.all()

  // Extract addresses from the results
  return results.map(row => String(row.address))
}

/**
 * Update the sanction status for multiple addresses
 * 
 * @param {Env} env - Environment with DB binding
 * @param {Array<{address: string, status: 'sanctioned'|'approved'|'pending'}>} addressResults - Results from sanction check
 * @returns {Promise<void>}
 */
export async function updateAddressStatuses(env, addressResults) {
  // Use a transaction for better performance and atomicity
  const batch = []

  for (const { address, status } of addressResults) {
    batch.push(
      env.DB.prepare(`
        INSERT INTO address_sanction_check (address, status)
        VALUES (?, ?)
        ON CONFLICT (address) DO UPDATE
        SET status = excluded.status
      `).bind(address.toLowerCase(), status)
    )
  }

  if (batch.length > 0) {
    await env.DB.batch(batch)
  }
}

/**
 * Add missing addresses from indexer_proof_set_rails to address_sanction_check
 * 
 * @param {Env} env - Environment with DB binding
 * @returns {Promise<number>} Number of addresses added
 */
export async function addMissingAddresses(env) {
  // Find addresses in indexer_proof_set_rails that are missing from address_sanction_check
  // and insert them with 'pending' status

  const result = await env.DB.prepare(`
    INSERT INTO address_sanction_check (address, status)
    SELECT DISTINCT lower(address), 'pending' FROM (
      SELECT DISTINCT payer as address FROM indexer_proof_set_rails
      UNION
      SELECT DISTINCT payee as address FROM indexer_proof_set_rails
    ) AS unique_addresses
    WHERE NOT EXISTS (
      SELECT 1 FROM address_sanction_check
      WHERE address_sanction_check.address = unique_addresses.address
    )
  `).bind().run()

  return result.meta?.changes || 0
}
