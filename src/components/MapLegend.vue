<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ALERT_STATUS_MARKER_STYLE, ALERT_STATUS_META, type AlertStatus } from '@/lib/alertStatus'

const LEGEND_ORDER: AlertStatus[] = ['critical', 'warning', 'normal', 'noThreshold', 'stale', 'noData']

/** Swatch mirrors the map marker: same fill, stroke, dash and radius as ALERT_STATUS_MARKER_STYLE. */
function swatchStyle(status: AlertStatus) {
  const markerStyle = ALERT_STATUS_MARKER_STYLE[status]
  const diameter = markerStyle.radius * 2
  return {
    width: `${diameter}px`,
    height: `${diameter}px`,
    background: markerStyle.fill,
    border: `${markerStyle.stroke ? 1.5 : 1}px ${markerStyle.dashArray ? 'dashed' : 'solid'} ${markerStyle.stroke ?? '#ffffff'}`,
  }
}
</script>

<template>
  <!-- z-500: above Leaflet panes (≤400), below its controls (1000). -->
  <Card
    size="sm"
    role="region"
    aria-label="圖例"
    class="absolute bottom-6 left-2.5 z-500 text-xs data-[size=sm]:gap-1 data-[size=sm]:py-2 leading-relaxed shadow-md"
  >
    <CardHeader>
      <CardTitle class="font-semibold group-data-[size=sm]/card:text-xs">警戒狀態</CardTitle>
    </CardHeader>
    <CardContent>
      <ul>
        <li v-for="status in LEGEND_ORDER" :key="status" class="flex items-center">
          <span class="mr-1.5 inline-flex size-3.5 items-center justify-center" aria-hidden="true">
            <span class="block rounded-full ring-1 ring-black/15" :style="swatchStyle(status)"></span>
          </span>
          {{ ALERT_STATUS_META[status].label }}
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
