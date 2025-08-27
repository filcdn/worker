import { checkIfAddressIsSanctioned as defaultCheckIfAddressIsSanctioned } from './chainalysis.js'

/**
 * Handle Filecoin Warm Storage Service data set creation
 *
 * @param {Env} env
 * @param {any} payload
 * @param {object} opts
 * @param {typeof defaultCheckIfAddressIsSanctioned} opts.checkIfAddressIsSanctioned
 * @throws {Error} If there is an error with fetching payer's address sanction
 *   status or during the database operation
 */
export async function handleFWSSDataSetCreated(
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
        payer,
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

/**
 * Handle Filecoin Warm Storage Service service termination
 *
 * @param {Env} env
 * @param {any} payload
 * @throws {Error}
 */
export async function handleFWSSServiceTerminated(env, payload) {
  await env.DB.prepare(
    `
      DELETE FROM data_sets
      WHERE id = ?
    `,
  )
    .bind(String(payload.data_set_id))
    .run()
}

/**
 * Handle Filecoin Warm Storage Service CDN service termination
 *
 * @param {Env} env
 * @param {any} payload
 * @throws {Error}
 */
export async function handleFWSSCdnServiceTerminated(env, payload) {
  await env.DB.prepare(
    `
      UPDATE data_sets
      SET with_cdn = false
      WHERE id = ?
    `,
  )
    .bind(String(payload.data_set_id))
    .run()
}
