import { checkIfAddressIsSanctioned as defaultCheckIfAddressIsSanctioned } from './chainalysis.js'

/**
 * Handle proof set rail creation
 *
 * @param {Env} env
 * @param {any} payload
 * @param {object} opts
 * @param {typeof defaultCheckIfAddressIsSanctioned} opts.checkIfAddressIsSanctioned
 * @throws {Error} If there is an error with fetching payer's address sanction
 *   status or during the database operation
 */
export async function handleFilecoinWarmStorageServiceDataSetCreated(
  env,
  payload,
  { checkIfAddressIsSanctioned = defaultCheckIfAddressIsSanctioned },
) {
  const {
    // @ts-ignore
    CHAINALYSIS_API_KEY,
  } = env

  if (payload.with_cdn) {
    const isPayerSanctioned = await checkIfAddressIsSanctioned(payload.payer, {
      CHAINALYSIS_API_KEY,
    })

    await env.DB.prepare(
      `
        INSERT INTO wallet_details (address, is_sanctioned)
        VALUES (?, ?)
        ON CONFLICT (address) DO UPDATE SET is_sanctioned = excluded.is_sanctioned
      `,
    )
      .bind(payload.payer, isPayerSanctioned)
      .run()
  }

  await env.DB.prepare(
    `
      INSERT INTO data_sets (
        id,
        payer_address,
        payee,
        with_cdn
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `,
  )
    .bind(
      String(payload.data_set_id),
      payload.payer,
      payload.payee,
      payload.with_cdn,
    )
    .run()
}
