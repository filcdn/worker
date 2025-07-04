import { updateBadBitsDatabase } from './store.js'

export const BADBITS_URL = 'https://badbits.dwebops.pub/badbits.deny'

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
    if (line.startsWith('//')) {
      const hash = line.substring(2).trim()
      if (hash) {
        currentBadHashes.add(hash)
      }
    }
  }
  const updateResult = await updateBadBitsDatabase(env, currentBadHashes)
  return updateResult
}
