import { expect } from 'vitest'

/**
 * @param {string | null} sqliteDateString
 * @param {string} [message]
 */
export function assertCloseToNow(sqliteDateString, message = 'timestamp') {
  expect(sqliteDateString, message).not.toBeNull()
  // D1 returns dates as UTC without timezone info, append 'Z' to parse as UTC
  const date = new Date(sqliteDateString + 'Z')
  // Assert that the timestamp is within 5 seconds of now
  expect(date, message).toBeCloseTo(new Date(), -4)
}
