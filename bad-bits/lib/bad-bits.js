import { getLastEtag, updateBadBitsDatabase } from './store.js'

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
  const req = new Request(BAD_BITS_URL)

  const lastEtag = await getLastEtag(env)
  if (lastEtag) {
    console.log('setting etag', lastEtag)
    req.headers.set('if-none-match', lastEtag)
  }

  const response = await fetch(req)

  if (response.status === 304) {
    console.log(
      'Bad bits were not modified since the last check, skipping update.',
    )
    return
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch bad bits: ${response.status} ${response.statusText}`,
    )
  }

  const text = await response.text()
  const etag = response.headers.get('etag')
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
  await updateBadBitsDatabase(env, currentBadHashes, etag)
}
