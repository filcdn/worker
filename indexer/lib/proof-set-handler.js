import { checkIfAddressIsSanctioned as defaultCheckIfAddressIsSanctioned } from '../lib/chainalysis.js'

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
export async function handleProofSetRailCreated(
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
      INSERT INTO wallet_details (address, is_sanctioned, last_screened_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT (address) DO UPDATE SET
        is_sanctioned = excluded.is_sanctioned,
        last_screened_at = excluded.last_screened_at
      `,
    )
      .bind(payload.payer, isPayerSanctioned)
      .run()
  }

  await env.DB.prepare(
    `
      INSERT INTO indexer_proof_set_rails (
        proof_set_id,
        rail_id,
        payer,
        payee,
        with_cdn
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `,
  )
    .bind(
      String(payload.proof_set_id),
      String(payload.rail_id),
      payload.payer,
      payload.payee,
      payload.with_cdn ?? null,
    )
    .run()
}
