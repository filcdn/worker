// Helper to seed a wallet
export async function withWallet(env, address, isSanctioned = false) {
  await env.DB.prepare(
    `INSERT INTO wallet_details (address, is_sanctioned, last_screened_at) VALUES (?, ?, datetime('now'))`,
  )
    .bind(address, isSanctioned)
    .run()
}

// Helper to seed a data set
export async function withDataSet(
  env,
  {
    id = '1',
    serviceProviderId = '1',
    payerAddress = '0xPayer',
    withCDN = true,
  },
) {
  await env.DB.prepare(
    `INSERT INTO data_sets (id, service_provider_id, payer_address, with_cdn) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, serviceProviderId, payerAddress, withCDN)
    .run()
}
