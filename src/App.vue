<script setup lang="ts">
import { computed, ref } from 'vue'
import MapLegend from '@/components/MapLegend.vue'
import MapNotice from '@/components/MapNotice.vue'
import StationMap from '@/components/StationMap.vue'
import StationPanel from '@/components/StationPanel.vue'
import { useRealtimeWaterLevels } from '@/composables/useRealtimeWaterLevels'
import { useStationRainfall } from '@/composables/useStationRainfall'
import { useStations } from '@/composables/useStations'
import { formatTime } from '@/lib/format'

const { stations, stationById, loadFailed: stationsLoadFailed } = useStations()
const selectedId = ref<string | null>(null)

const { rainfall, rainfallLoadState, refreshSelected: refreshSelectedRainfall } =
  useStationRainfall(selectedId)

const {
  readings,
  statusById,
  selectedHistory,
  lastUpdated,
  error: realtimeError,
} = useRealtimeWaterLevels(stationById, selectedId, { onUpdate: refreshSelectedRainfall })

const selectedStation = computed(() =>
  selectedId.value ? stationById.value.get(selectedId.value) : undefined,
)
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
    <!-- z-1100: header stays above Leaflet panes/controls (≤1000) and the panel. -->
    <header
      class="relative z-1100 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-background px-4 py-2"
    >
      <div class="min-w-0">
        <h1 class="text-lg font-bold">河川水位測站地圖</h1>
        <p class="text-xs text-muted-foreground">
          資料來源：<a
            href="https://opendata.wra.gov.tw/"
            target="_blank"
            rel="noopener"
            class="underline underline-offset-2 hover:text-foreground"
          >經濟部水利署 開放資料</a>
        </p>
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground" aria-live="polite">
        <span>最後更新 {{ formatTime(lastUpdated) }}</span>
        <span v-if="realtimeError" class="text-destructive">資料更新失敗，稍後重試</span>
      </div>
    </header>
    <main class="relative min-h-0 flex-1 overflow-hidden">
      <StationMap
        :geojson="stations"
        :status-by-id="statusById"
        :selected-id="selectedId"
        :readings="readings"
        @select="selectedId = $event"
      />
      <MapLegend />
      <MapNotice v-if="!stations && !stationsLoadFailed">載入測站中…</MapNotice>
      <MapNotice v-if="stationsLoadFailed" tone="error">測站資料載入失敗，請重新整理</MapNotice>
      <StationPanel
        v-if="selectedStation"
        :station="selectedStation"
        :reading="readings.get(selectedStation.id)"
        :status="statusById.get(selectedStation.id) ?? 'noData'"
        :history="selectedHistory"
        :rainfall="rainfall"
        :rainfall-load-state="rainfallLoadState"
        @close="selectedId = null"
      />
    </main>
  </div>
</template>
