import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { IS_RAINFALL_ENABLED } from '@/lib/config'
import { createLatestRequestGuard } from '@/lib/latestRequestGuard'
import { fetchStationRainfall, type RainfallPoint } from '@/lib/rainfall'
import type { RainfallLoadState } from '@/lib/rainfallLoadState'

/** Hourly rainfall for the selected station: loads on selection, refreshes silently on demand. */
export function useStationRainfall(selectedId: Ref<string | null>) {
  const rainfall = shallowRef<RainfallPoint[] | null>(null)
  const rainfallLoadState = ref<RainfallLoadState>(IS_RAINFALL_ENABLED ? 'loading' : 'off')
  const guard = createLatestRequestGuard<RainfallPoint[] | null>()

  async function load(stationId: string, { showLoading }: { showLoading: boolean }) {
    if (!IS_RAINFALL_ENABLED) return
    if (showLoading) {
      rainfall.value = null
      rainfallLoadState.value = 'loading'
    }
    const result = await guard.run((signal) => fetchStationRainfall(stationId, signal))
    if (!result.ok && result.stale) return // superseded by a newer selection/poll, or unmounted
    if (result.ok) {
      rainfall.value = result.value
      rainfallLoadState.value = result.value === null ? 'none' : 'ok'
    } else if (showLoading) {
      rainfall.value = null
      rainfallLoadState.value = 'unavailable'
    }
    // A failed silent background refresh keeps the previous rainfall and state.
  }

  /** Silent refresh for the open station (5-min dataset cache); never restarts an in-flight load. */
  function refreshSelected() {
    if (selectedId.value && rainfallLoadState.value !== 'loading') {
      void load(selectedId.value, { showLoading: false })
    }
  }

  watch(selectedId, (stationId) => {
    if (stationId) {
      void load(stationId, { showLoading: true })
    } else {
      guard.abort()
      rainfall.value = null
    }
  })

  onBeforeUnmount(() => guard.abort())

  return { rainfall, rainfallLoadState, refreshSelected }
}
