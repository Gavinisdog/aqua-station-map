<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { buildStationChartOption } from '@/lib/chartOptions'
import type { WaterLevelReading } from '@/lib/realtime'
import type { StationProps } from '@/lib/stations'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
])

const props = defineProps<{
  station: StationProps
  history: WaterLevelReading[]
}>()

const chartContainer = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
useResizeObserver(chartContainer, () => chart?.resize())

function render() {
  const option = buildStationChartOption({
    thresholds: props.station,
    history: props.history,
    now: Date.now(),
  })
  chart?.setOption(option, { notMerge: true })
}

onMounted(() => {
  if (!chartContainer.value) return
  chart = echarts.init(chartContainer.value)
  render()
})

watch(() => [props.station, props.history], render)

onBeforeUnmount(() => {
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div ref="chartContainer" class="h-75 w-full" role="img" :aria-label="`${station.name} 水位時序圖`"></div>
    <p v-if="history.length < 2" class="mt-1 text-xs text-muted-foreground">
      水位折線由每 10 分鐘輪詢累積，開啟頁面越久資料越多。
    </p>
  </div>
</template>
