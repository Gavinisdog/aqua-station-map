import type { WaterLevelReading } from '@/lib/realtime'

/**
 * Adds each station's latest reading to its history in place: skips missing levels and
 * duplicate times, keeps time order, and drops the oldest points beyond the cap.
 */
export function appendToHistory(
  historyByStation: Map<string, WaterLevelReading[]>,
  latestReadings: Map<string, WaterLevelReading>,
  maxPointsPerStation = 500,
): void {
  for (const [stationId, reading] of latestReadings) {
    if (reading.waterLevelM === null) continue
    const history = historyByStation.get(stationId) ?? []
    if (history.some((point) => point.observedAt === reading.observedAt)) continue
    history.push(reading)
    history.sort((left, right) => left.observedAt - right.observedAt)
    if (history.length > maxPointsPerStation) history.splice(0, history.length - maxPointsPerStation)
    historyByStation.set(stationId, history)
  }
}
