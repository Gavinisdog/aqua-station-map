<script setup lang="ts">
import { X } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ALERT_LEVELS, ALERT_STATUS_META, type AlertStatus } from '@/lib/alertStatus'
import { formatLevel, formatTime } from '@/lib/format'
import type { RainfallPoint } from '@/lib/rainfall'
import type { RainfallLoadState } from '@/lib/rainfallLoadState'
import type { WaterLevelReading } from '@/lib/realtime'
import type { StationProps } from '@/lib/stations'
import StationChart from '@/components/StationChart.vue'

defineProps<{
  station: StationProps
  reading: WaterLevelReading | undefined
  status: AlertStatus
  history: WaterLevelReading[]
  rainfall: RainfallPoint[] | null
  rainfallLoadState: RainfallLoadState
}>()
defineEmits<{ close: [] }>()
</script>

<template>
  <!-- Bottom sheet below md; fixed 400px right column at md+. z-1000 sits above Leaflet panes. -->
  <aside
    aria-label="測站資訊"
    class="absolute inset-x-0 bottom-0 z-1000 max-h-3/5 overflow-y-auto rounded-t-xl border-t bg-card shadow-lg md:top-0 md:left-auto md:max-h-none md:w-100 md:rounded-none md:border-t-0 md:border-l"
  >
    <Card class="min-h-full gap-3 rounded-none py-3 ring-0">
      <CardHeader>
        <CardTitle class="text-lg font-semibold wrap-anywhere">{{ station.name }}</CardTitle>
        <CardDescription class="text-sm">{{ station.river || '—' }}・站號 {{ station.id }}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" aria-label="關閉" @click="$emit('close')">
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent class="flex min-w-0 flex-col gap-2">
        <p class="flex flex-wrap items-center gap-2">
          <Badge
            :style="{ backgroundColor: ALERT_STATUS_META[status].color, color: ALERT_STATUS_META[status].textColor }"
          >
            {{ ALERT_STATUS_META[status].label }}
          </Badge>
          <strong class="text-base">{{ formatLevel(reading?.waterLevelM) }}</strong>
          <span class="text-sm text-muted-foreground">{{ formatTime(reading?.observedAt) }}</span>
        </p>
        <dl class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <div v-for="level in ALERT_LEVELS" :key="level.key" class="flex gap-1">
            <dt class="text-muted-foreground">{{ level.shortLabel }}</dt><dd>{{ formatLevel(station[level.key]) }}</dd>
          </div>
        </dl>
        <StationChart
          :station="station"
          :history="history"
          :rainfall="rainfall"
          :rainfall-load-state="rainfallLoadState"
        />
      </CardContent>
    </Card>
  </aside>
</template>
