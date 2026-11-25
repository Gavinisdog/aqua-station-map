import proj4 from 'proj4'
import { parseOptionalNumber } from '#src/lib/parseOptionalNumber.ts'
import type { StationCollection, StationFeature } from '#src/types/station.ts'

/** Raw row from the WRA station table (only the fields we read). */
export type StationRow = {
  basinidentifier?: string
  observatoryname?: string
  rivername?: string
  alertlevel1?: unknown
  alertlevel2?: unknown
  alertlevel3?: unknown
  locationbytwd97_xy?: unknown
}

const TWD97 =
  '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs'

const roundTo6Decimals = (value: number) => Math.round(value * 1e6) / 1e6

/** "313411.44 2790930.63" (TWD97 TM2) -> [lon, lat] or null */
export function toWgs84(xy: unknown): [number, number] | null {
  if (typeof xy !== 'string') return null
  const parts = xy.trim().split(/\s+/)
  if (parts.length !== 2) return null
  const easting = Number(parts[0])
  const northing = Number(parts[1])
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null
  const [lon, lat] = proj4(TWD97, 'WGS84', [easting, northing])
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return [roundTo6Decimals(lon), roundTo6Decimals(lat)]
}

/** Alert threshold cell: blank, null or non-numeric → null (same rule as the app's parsers). */
export const parseAlert = parseOptionalNumber

export function toFeatureCollection(rows: StationRow[]): StationCollection {
  const features: StationFeature[] = []
  for (const row of rows) {
    if (!row.basinidentifier) continue
    const coordinates = toWgs84(row.locationbytwd97_xy)
    if (!coordinates) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: {
        id: row.basinidentifier,
        name: row.observatoryname ?? '',
        river: row.rivername ?? '',
        alert1: parseAlert(row.alertlevel1),
        alert2: parseAlert(row.alertlevel2),
        alert3: parseAlert(row.alertlevel3),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}
