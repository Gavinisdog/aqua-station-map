import { defineAsyncComponent, h } from 'vue'

// ECharts is the heaviest dependency and is only needed once a station is opened,
// so it lives in its own chunk. `prefetchStationChart()` warms it up after first paint.
export const loadStationChart = () => import('@/components/StationChart.vue')

export const prefetchStationChart = () => {
  void loadStationChart().catch(() => {
    // Ignore: the real load on click retries and shows the error there.
  })
}

/** Same height as the chart, so the panel doesn't jump while the chunk loads. */
const ChartPlaceholder = () =>
  h('div', {
    class: 'h-75 w-full animate-pulse rounded-md bg-muted',
    role: 'status',
    'aria-label': '圖表載入中',
  })

export const AsyncStationChart = defineAsyncComponent({
  loader: loadStationChart,
  loadingComponent: ChartPlaceholder,
  delay: 0,
})
