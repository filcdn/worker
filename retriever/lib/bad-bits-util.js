import { httpAssert } from './http-assert'

/**
 * @param {string} cid
 * @returns {Promise<string>} Bad Bits entry in the legacy double-hash format
 */
export async function getBadBitsEntry(cid) {
  const cidBytes = new TextEncoder().encode(`${cid}/`)
  const hash = await crypto.subtle.digest('SHA-256', cidBytes)
  const hashHex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hashHex
}

/**
 * @param {Env} env
 * @param {string} cid
 */
export async function assertNotInBadBits(env, cid) {
  const badBitsEntry = await getBadBitsEntry(cid)

  const result = await env.DB.prepare('SELECT * FROM bad_bits WHERE hash = ?')
    .bind(badBitsEntry)
    .all()

  httpAssert(
    result.results.length === 0,
    404,
    'The requested CID was flagged by the Bad Bits Denylist at https://badbits.dwebops.pub',
  )
}
