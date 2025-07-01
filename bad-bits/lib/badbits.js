import { createHash } from 'crypto'
import { CID } from 'multiformats/cid'
import * as base58 from 'multiformats/bases/base58'
import {
  updateBadBitsDatabase,
  checkHashesAgainstBadBits,
  getRootCidStatus,
  updateRootCidStatus,
} from './store.js'

const BADBITS_URL = 'https://badbits.dwebops.pub/badbits.deny'

export async function fetchAndStoreBadBits(env) {
  const response = await fetch(BADBITS_URL)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch badbits: ${response.status} ${response.statusText}`,
    )
  }

  const text = await response.text()
  const lines = text.split('\n')

  const currentBadHashes = new Set()

  for (const line of lines) {
    if (line.trim() === '' || line.startsWith('#')) {
      continue
    }

    if (line.startsWith('//')) {
      const hash = line.substring(2).trim()
      if (hash) {
        currentBadHashes.add(hash)
      }
    }
  }

  const updateResult = await updateBadBitsDatabase(
    env,
    currentBadHashes,
    getHashType,
  )

  await updateRootCidStatuses(env)

  return updateResult
}

/**
 * Checks if a CID is in the badbits denylist
 *
 * @param {Object} env - Environment containing database connection
 * @param {string} cid - The CID to check
 * @param {string} existingStatus - Status of the CID ('blocked', 'allowed', or
 *   'unchecked')
 * @returns {Promise<string>} - Status: 'blocked', 'allowed', or 'unchecked'
 */
export async function checkCidAgainstBadBits(env, cid, existingStatus) {
  try {
    if (existingStatus && existingStatus !== 'unchecked') {
      return existingStatus
    }

    const hashes = generateHashesForCid(cid)

    const isBlocked = await checkHashesAgainstBadBits(env, hashes)

    const newStatus = isBlocked ? 'blocked' : 'allowed'
    await updateRootCidStatus(env, cid, newStatus)

    return newStatus
  } catch (error) {
    console.error(`Error checking CID ${cid} against badbits:`, error)
    return 'unchecked'
  }
}

async function updateRootCidStatuses(env) {
  // TODO: Also update roots that are already known to be blocked or allowed
  const { results } = await env.DB.prepare(
    'SELECT root_cid,status FROM indexer_roots WHERE status = "unchecked"',
  ).all()

  for (const { root_cid, status } of results) {
    await checkCidAgainstBadBits(env, root_cid, status)
  }
}

/**
 * Generates hashes for a given CID This includes:
 *
 * 1. SHA256 of the CID multihash
 * 2. SHA256 of the CID string with trailing slash
 * 3. The raw CID string itself
 *
 * @param {string} cid - The CID to generate hashes for
 * @returns {string[]} - Array of generated hashes
 */
export function generateHashesForCid(cid) {
  const hashes = []

  try {
    try {
      const parsedCid = CID.parse(cid)
      const multihash = Buffer.from(parsedCid.multihash.bytes)
      const sha256Hash = createHash('sha256').update(multihash).digest('hex')
      hashes.push(sha256Hash)

      // Also add base58 encoded version
      const base58MultihashString = base58.base58btc.encode(multihash)
      const sha256Base58Hash = createHash('sha256')
        .update(base58MultihashString)
        .digest('hex')
      hashes.push(sha256Base58Hash)
    } catch (e) {
      console.error(`Error parsing CID ${cid}:`, e)
      throw new Error(`Invalid CID format: ${cid}`, { cause: e })
    }

    // 2. For legacy CID blocks (sha256 of the CID string with trailing slash)
    const legacyCidHash = createHash('sha256').update(`${cid}/`).digest('hex')
    hashes.push(legacyCidHash)

    // 3. Raw hash comparison (in case the denylist contains the raw CID hash)
    hashes.push(cid)
  } catch (error) {
    console.error(`Error generating hashes for CID ${cid}:`, error)
    throw new Error(`Failed to generate hashes for CID ${cid}`, {
      cause: error,
    })
  }

  return hashes
}

/**
 * Determine the hash type based on hash format
 *
 * @param {string} hash - The hash to check
 * @returns {string} - Hash type identifier
 */
function getHashType(hash) {
  // This is a simple heuristic - a more sophisticated approach would be needed
  // for a production system to properly identify all hash types
  if (hash.length === 64 && /^[0-9a-f]+$/i.test(hash)) {
    return 'sha256'
  } else if (hash.startsWith('Qm')) {
    return 'multihash-base58'
  } else if (hash.startsWith('bafy')) {
    return 'cid-base32'
  } else {
    return 'unknown'
  }
}
