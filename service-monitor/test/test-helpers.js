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
  { id, storageProviderAddress, payerAddress, payeeAddress, withCDN = true },
) {
  await env.DB.prepare(
    `INSERT INTO data_sets (id, storage_provider_address, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, storageProviderAddress, payerAddress, payeeAddress, withCDN)
    .run()
}
