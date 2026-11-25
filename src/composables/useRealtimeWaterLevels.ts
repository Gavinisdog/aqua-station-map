import { computed, ref, shallowRef, type Ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { computeAlertStatus, type AlertStatus } from '@/lib/alertStatus'
import { MINUTE_MS, POLL_INTERVAL_MS } from '@/lib/config'
import { appendToHistory } from '@/lib/history'
import { fetchRealtimeWaterLevels, type WaterLevelReading } from '@/lib/realtime'
import type { StationProps } from '@/lib/stations'
import { usePolling } from '@/composables/usePolling'

const STATUS_CLOCK_INTERVAL_MS = MINUTE_MS

/**
 * Polls the realtime water-level snapshot, accumulates per-station history and derives each
 * station's alert status and the selected station's history. `onUpdate` runs after every
 * successful poll.
 */
export function useRealtimeWaterLevels(
  stationById: Ref<Map<string, StationProps>>,
  selectedId: Ref<string | null>,
  { onUpdate }: { onUpdate?: () => void } = {},
) {
  const readings = shallowRef(new Map<string, WaterLevelReading>())
  const historyByStation = new Map<string, WaterLevelReading[]>() // mutated in place by appendToHistory
  const historyVersion = ref(0)
  const statusClock = ref(Date.now())

  // Re-evaluate statuses on a clock so a stale reading never stays "normal" when polling keeps failing.
  useIntervalFn(() => {
    statusClock.value = Date.now()
  }, STATUS_CLOCK_INTERVAL_MS)

  const polling = usePolling(
    (signal) => fetchRealtimeWaterLevels(signal),
    (latestReadings) => {
      appendToHistory(historyByStation, latestReadings)
      // Keep stations missing from this snapshot; their old reading ages into "資料過舊".
      readings.value = new Map([...readings.value, ...latestReadings])
      statusClock.value = Date.now()
      historyVersion.value++
      onUpdate?.()
    },
    POLL_INTERVAL_MS,
  )

  const statusById = computed(() => {
    const byId = new Map<string, AlertStatus>()
    for (const [stationId, station] of stationById.value) {
      byId.set(stationId, computeAlertStatus(readings.value.get(stationId), station, statusClock.value))
    }
    return byId
  })

  /** Copy of the selected station's history; recomputed on selection change and on every poll. */
  const selectedHistory = computed(() => {
    void historyVersion.value // historyByStation is mutated in place, so track the version
    const stationId = selectedId.value
    return stationId ? (historyByStation.get(stationId) ?? []).slice() : []
  })

  return {
    readings,
    statusById,
    selectedHistory,
    lastUpdated: polling.lastUpdated,
    error: polling.error,
  }
}
