import http from '@/api/axios'
import type { StationCollection } from '@/types/station'

export type { StationProps, StationFeature, StationCollection } from '@/types/station'

export async function loadStations(signal?: AbortSignal): Promise<StationCollection> {
  const { data } = await http.get<StationCollection>(`${import.meta.env.BASE_URL}stations.geojson`, {
    signal,
  })
  if (!Array.isArray(data?.features)) throw new Error('stations.geojson: unexpected payload')
  return data
}
