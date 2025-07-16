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

  let isPayerSanctioned
  try {
    if (payload.with_cdn) {
      isPayerSanctioned = await isAddressSanctioned(payload.payer, {
        CHAINALYSIS_API_KEY,
      })
    }
  } catch (err) {
    console.error(`Error checking if payer is sanctioned: ${err}`)
    throw err // Let caller handle the error
  }

  await env.DB.prepare(
    `
      INSERT INTO indexer_proof_set_rails (
        proof_set_id,
        rail_id,
        payer,
        payee,
        with_cdn,
        is_payer_sanctioned
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `,
  )
    .bind(
      String(payload.proof_set_id),
      String(payload.rail_id),
      payload.payer,
      payload.payee,
      payload.with_cdn ?? null,
      isPayerSanctioned ?? null,
    )
    .run()
}
