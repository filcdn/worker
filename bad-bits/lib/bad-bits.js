import { updateBadBitsDatabase } from './store.js'

export const BAD_BITS_URL = 'https://badbits.dwebops.pub/badbits.deny'

/**
 * @param {Env} env
 * @param {object} options
 * @param {typeof globalThis.fetch} [options.fetch]
 * @returns
 */
export async function fetchAndStoreBadBits(
  env,
  { fetch } = { fetch: globalThis.fetch },
) {
  const response = await fetch(BAD_BITS_URL)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch bad bits: ${response.status} ${response.statusText}`,
    )
  }

  const text = await response.text()
  const lines = text.split('\n')

  const currentBadHashes = new Set()

  for (const line of lines) {
    // FIXME: add tests
    // Skip empty lines and comments
    if (line.length === 0 || line.startsWith('#')) continue

    if (line.startsWith('//')) {
      const hash = line.substring(2).trim()
      if (hash) {
        currentBadHashes.add(hash)
      } else {
        // FIXME: add a test
        throw new Error(`Malformed bad bits line - empty hash: ${line}`)
      }
    } else {
      // FIXME: add a test
      throw new Error(`Unsupported bad bits line: ${line}`)
    }
  }
  await updateBadBitsDatabase(env, currentBadHashes)
}
