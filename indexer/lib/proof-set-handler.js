import { isAddressSanctioned as defaultIsAddressSanctioned } from '../lib/chainalysis.js'

/**
 * Handle proof set rail creation
 *
 * @param {Env} env
 * @param {any} payload
 * @param {object} opts
 * @param {typeof defaultIsAddressSanctioned} opts.isAddressSanctioned
 * @throws {Error} If there is an error with fetching payer's address sanction
 *   status or during the database operation
 */
export async function handleProofSetRailCreated(
  env,
  payload,
  { isAddressSanctioned = defaultIsAddressSanctioned },
) {
  const {
    // @ts-ignore
    CHAINALYSIS_API_KEY,
  } = env

  if (payload.with_cdn) {
    try {
      const isPayerSanctioned = await isAddressSanctioned(payload.payer, {
        CHAINALYSIS_API_KEY,
      })

      await env.DB.prepare(
        `
        INSERT INTO wallet_details (wallet_address, is_sanctioned)
        VALUES (?, ?)
        ON CONFLICT (wallet_address) DO UPDATE SET is_sanctioned = excluded.is_sanctioned
      `,
      )
        .bind(payload.payer, isPayerSanctioned)
        .run()
    } catch (err) {
      console.error(`Error checking if payer is sanctioned: ${err}`)
      throw err // Let caller handle the error
    }
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
