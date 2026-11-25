import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import axios from 'axios'
import { loadStations, type StationCollection, type StationProps } from '@/lib/stations'

/** Loads public/stations.geojson once on mount; the request is cancelled on unmount. */
export function useStations() {
  const stations = shallowRef<StationCollection | null>(null)
  const loadFailed = ref(false)
  const stationById = computed(() => {
    const byId = new Map<string, StationProps>()
    for (const feature of stations.value?.features ?? []) byId.set(feature.properties.id, feature.properties)
    return byId
  })

  const controller = new AbortController()
  onMounted(async () => {
    try {
      stations.value = await loadStations(controller.signal)
    } catch (error) {
      if (!axios.isCancel(error)) loadFailed.value = true
    }
  })
  onBeforeUnmount(() => controller.abort())

  return { stations, stationById, loadFailed }
}
