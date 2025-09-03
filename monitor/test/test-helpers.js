// Helper to seed a sanctioned wallet
export async function withSanctionedWallet(env, address) {
  await env.DB.prepare(
    `INSERT INTO wallet_details (address, is_sanctioned, last_screened_at) VALUES (?, 1, datetime('now'))`,
  )
    .bind(address, 1)
    .run()
}

// Helper to seed a data set
export async function withDataSet(
  env,
  { id, storageProviderAddress, payerAddress, payeeAddress },
) {
  await env.DB.prepare(
    `INSERT INTO data_sets (id, storage_provider_address, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, 1)`,
  )
    .bind(id, storageProviderAddress, payerAddress, payeeAddress)
    .run()
}
