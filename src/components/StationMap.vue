<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ALERT_STATUS_MARKER_STYLE, ALERT_STATUS_META, type AlertStatus } from '@/lib/alertStatus'
import { escapeHtml } from '@/lib/escapeHtml'
import { formatLevel } from '@/lib/format'
import type { WaterLevelReading } from '@/lib/realtime'
import type { StationCollection, StationFeature } from '@/lib/stations'

const TAIWAN_CENTER: L.LatLngTuple = [23.7, 121.0]
const INITIAL_ZOOM = 7
const SELECTED_MARKER_RADIUS = 9
const SELECTED_STROKE = { color: '#1a1a1a', weight: 3 }

const props = defineProps<{
  geojson: StationCollection | null
  statusById: Map<string, AlertStatus>
  selectedId: string | null
  readings: Map<string, WaterLevelReading>
}>()
const emit = defineEmits<{ select: [id: string] }>()

const mapContainer = ref<HTMLDivElement | null>(null)
const map = shallowRef<L.Map | null>(null)
let stationLayer: L.GeoJSON | null = null
const renderer = L.canvas({ padding: 0.5 })

function markerStyle(feature?: StationFeature): L.CircleMarkerOptions {
  const stationId = feature?.properties.id ?? ''
  const status = props.statusById.get(stationId) ?? 'noData'
  const isSelected = stationId === props.selectedId
  const statusStyle = ALERT_STATUS_MARKER_STYLE[status]
  return {
    radius: isSelected ? SELECTED_MARKER_RADIUS : statusStyle.radius,
    fillColor: statusStyle.fill,
    fillOpacity: 0.9,
    color: isSelected ? SELECTED_STROKE.color : (statusStyle.stroke ?? '#ffffff'),
    weight: isSelected ? SELECTED_STROKE.weight : statusStyle.stroke ? 1.5 : 1,
    // setStyle merges options, so a non-dashed status must overwrite a previous dash;
    // '1 0' (1 on, 0 off) is a solid line in Leaflet's canvas renderer.
    dashArray: statusStyle.dashArray ?? '1 0',
  }
}

function tooltipHtml(feature: StationFeature): string {
  const { id, name } = feature.properties
  const status = props.statusById.get(id) ?? 'noData'
  const level = formatLevel(props.readings.get(id)?.waterLevelM)
  return `<strong>${escapeHtml(name)}</strong><br>水位 ${level}・${ALERT_STATUS_META[status].label}`
}

function buildStationLayer(geojson: StationCollection) {
  if (!map.value) return
  stationLayer?.remove()
  stationLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, { renderer, ...markerStyle(feature as StationFeature) }),
    style: (feature) => markerStyle(feature as StationFeature),
    onEachFeature: (feature, marker) => {
      const station = feature as StationFeature
      marker.bindTooltip(() => tooltipHtml(station), { direction: 'top', offset: [0, -6] })
      marker.on('click', () => emit('select', station.properties.id))
    },
  }).addTo(map.value)
  bringSelectedToFront()
}

function bringSelectedToFront() {
  if (!stationLayer || !props.selectedId) return
  stationLayer.eachLayer((layer) => {
    const marker = layer as L.CircleMarker
    const feature = marker.feature as StationFeature | undefined
    if (feature?.properties.id === props.selectedId) marker.bringToFront()
  })
}

onMounted(() => {
  if (!mapContainer.value) return
  map.value = L.map(mapContainer.value, { preferCanvas: true }).setView(TAIWAN_CENTER, INITIAL_ZOOM)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map.value)
  if (props.geojson) buildStationLayer(props.geojson)
})

watch(
  () => props.geojson,
  (geojson) => {
    if (geojson) buildStationLayer(geojson)
  },
)

// Polls and selection only restyle existing markers; the layer is never rebuilt.
watch([() => props.statusById, () => props.selectedId], () => {
  if (!stationLayer) return
  stationLayer.setStyle((feature) => markerStyle(feature as StationFeature))
  bringSelectedToFront()
})

onBeforeUnmount(() => {
  stationLayer = null
  map.value?.remove()
  map.value = null
})
</script>

<template>
  <div ref="mapContainer" class="absolute inset-0" role="region" aria-label="測站地圖"></div>
</template>
