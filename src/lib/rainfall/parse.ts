import { parseOptionalNumber } from '@/lib/parseOptionalNumber'
import { parseWraTime } from '@/lib/realtime'

export type RainfallPoint = { observedAt: number; rainfallMm: number | null }

export class RainUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RainUnavailableError'
  }
}

/** WRA's "missing" marker; always treated as missing, whatever the header's missVal says. */
const WRA_MISSING_VALUE = -999

function parseRainfallMm(value: unknown, missingValue: number): number | null {
  const rainfallMm = parseOptionalNumber(value)
  if (rainfallMm === missingValue || rainfallMm === WRA_MISSING_VALUE) return null
  return rainfallMm
}

/** Extract one station's hourly rainfall from the WRA rainfall dataset; null if the station is absent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStationRainfall(dataset: any, stationId: string): RainfallPoint[] | null {
  const timeSeries = dataset?.timeSeries
  if (!Array.isArray(timeSeries)) return null
  const locationId = `C${stationId}`
  const stationSeries = timeSeries.find((series) => series?.header?.locationId === locationId)
  if (!stationSeries) return null
  // A blank or absent missVal means "not declared", not 0 (that would null every real 0 mm).
  const missingValue = parseOptionalNumber(stationSeries.header.missVal) ?? WRA_MISSING_VALUE
  const points: RainfallPoint[] = []
  for (const event of Array.isArray(stationSeries.events) ? stationSeries.events : []) {
    if (typeof event?.date !== 'string' || typeof event?.time !== 'string') continue
    const observedAt = parseWraTime(`${event.date}T${event.time}`)
    if (!Number.isFinite(observedAt)) continue
    points.push({ observedAt, rainfallMm: parseRainfallMm(event.value, missingValue) })
  }
  return points.sort((left, right) => left.observedAt - right.observedAt)
}

/**
 * WRA labels the body `application/json; charset=UTF-8` but station names are Big5 bytes;
 * a Big5 trail byte 0x5C ("\") breaks UTF-8 JSON. Everything else is ASCII, so decode as
 * Big5 first, then fall back to UTF-8 in case WRA fixes the encoding.
 * No content-type gate: decoding plus the shape check reject HTML bot pages.
 */
export function decodeRainfallDataset(body: unknown): unknown {
  const dataset = decodeJson(body)
  if (!Array.isArray((dataset as { timeSeries?: unknown } | null)?.timeSeries)) {
    throw new RainUnavailableError('Unexpected payload')
  }
  return dataset
}

function decodeJson(body: unknown): unknown {
  for (const encoding of ['big5', 'utf-8']) {
    try {
      return JSON.parse(new TextDecoder(encoding).decode(body as BufferSource))
    } catch {
      // try next encoding
    }
  }
  throw new RainUnavailableError('Invalid JSON')
}
