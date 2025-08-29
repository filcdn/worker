import { checkIfAddressIsSanctioned as defaultCheckIfAddressIsSanctioned } from './chainalysis.js'
import { keccak256 } from '@ethersproject/keccak256'
import { pack } from '@ethersproject/solidity'
import { defaultAbiCoder } from '@ethersproject/abi'

/**
 * Handle proof set rail creation
 *
 * @param {{ CHAINALYSIS_API_KEY: string; DB: D1Database }} env
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
  const { CHAINALYSIS_API_KEY } = env

  const withCDN = checkMetadataWithCDNEnabled(
    payload.metadata_keys,
    payload.metadata_values,
  )

  if (withCDN) {
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
      .bind(payload.payer.toLowerCase(), isPayerSanctioned)
      .run()
  }

  await env.DB.prepare(
    `
      INSERT INTO data_sets (
        id,
        payer_address,
        payee_address,
        with_cdn
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `,
  )
    .bind(
      String(payload.data_set_id),
      payload.payer.toLowerCase(),
      payload.payee.toLowerCase(),
      withCDN,
    )
    .run()
}

/**
 * Ported from FilecoinWarmStorageService.sol
 *
 * @param {string[]} keys
 * @param {string[]} values
 * @returns {boolean}
 */
function checkMetadataWithCDNEnabled(keys, values) {
  const keyHash = keccak256(pack(['string'], ['withCDN']))

  for (let i = 0; i < keys.length; i++) {
    if (keccak256(pack(['string'], [keys[i]])) === keyHash) {
      if (isEmptyOrTrue(values[i])) {
        return true
      }
    }
  }

  return false
}

/**
 * Ported from FilecoinWarmStorageService.sol
 *
 * @param {string} value
 * @returns {boolean}
 */
function isEmptyOrTrue(value) {
  // Treat truly empty bytes as enabled
  if (value.length === 0) {
    return true
  }

  const valueHash = keccak256(value)

  if (valueHash === keccak256(defaultAbiCoder.encode(['string'], ['']))) {
    return true
  }
  if (valueHash === keccak256(pack(['string'], ['']))) {
    return true
  }

  // Common encodings for the string "true"
  if (valueHash === keccak256(pack(['string'], ['true']))) {
    return true
  }
  if (valueHash === keccak256(defaultAbiCoder.encode(['string'], ['true']))) {
    return true
  }

  return false
}
