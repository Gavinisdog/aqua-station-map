import axios, { type AxiosResponse } from 'axios'
import http from '@/api/axios'
import { REALTIME_WATER_LEVEL_URL } from '@/lib/config'
import { parseOptionalNumber } from '@/lib/parseOptionalNumber'

export type WaterLevelReading = { waterLevelM: number | null; observedAt: number }

export class RealtimeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RealtimeUnavailableError'
  }
}

/** WRA times are local Taiwan time without offset. */
export function parseWraTime(localDateTime: string): number {
  return Date.parse(localDateTime + '+08:00')
}

/** One reading per station; when a station appears more than once, the latest time wins. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseRealtimeWaterLevels(rows: any[]): Map<string, WaterLevelReading> {
  const readingByStation = new Map<string, WaterLevelReading>()
  for (const row of rows) {
    const stationId = row?.stationid
    if (!stationId || typeof row.datetime !== 'string') continue
    const observedAt = parseWraTime(row.datetime)
    if (!Number.isFinite(observedAt)) continue
    const previous = readingByStation.get(stationId)
    if (previous && previous.observedAt >= observedAt) continue
    readingByStation.set(stationId, { waterLevelM: parseOptionalNumber(row.waterlevel), observedAt })
  }
  return readingByStation
}

/**
 * Latest realtime snapshot. `cancelPrevious` cancels any older in-flight realtime request
 * (layer 1), so concurrent callers cancel each other; callers still guard ordering with
 * `createLatestRequestGuard` (layer 2).
 * Rejects a DOMException `AbortError` when cancelled (caller abort or superseded), and
 * `RealtimeUnavailableError` on timeout, HTTP/network error or a non-array / non-JSON body.
 */
export async function fetchRealtimeWaterLevels(
  signal?: AbortSignal,
): Promise<Map<string, WaterLevelReading>> {
  let response: AxiosResponse<unknown>
  try {
    response = await http.get<unknown>(REALTIME_WATER_LEVEL_URL, { signal, cancelPrevious: true })
  } catch (error) {
    // Keep the public contract: any cancel (never a timeout) surfaces as a DOM AbortError.
    if (axios.isCancel(error) || signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new RealtimeUnavailableError(`Network error: ${(error as Error)?.message ?? error}`)
  }
  // axios leaves a non-JSON body (e.g. an HTML bot-challenge page) as a string.
  if (!Array.isArray(response.data)) throw new RealtimeUnavailableError('Unexpected payload')
  return parseRealtimeWaterLevels(response.data)
}
