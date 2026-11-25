import type { AlertThresholds } from '@/types/station'
import { STALE_AFTER_MS } from '@/lib/config'
import type { WaterLevelReading } from '@/lib/realtime'

export type { AlertThresholds } from '@/types/station'

/** critical = at/above 一級; warning = at/above 二級 or 三級. */
export type AlertStatus = 'critical' | 'warning' | 'normal' | 'noThreshold' | 'stale' | 'noData'

export const ALERT_STATUS_META: Record<
  AlertStatus,
  { color: string; textColor: string; label: string }
> = {
  critical: { color: '#d7301f', textColor: '#ffffff', label: '一級警戒' },
  warning: { color: '#f2b701', textColor: '#1f2937', label: '二三級警戒' },
  normal: { color: '#2ca25f', textColor: '#ffffff', label: '正常' },
  noThreshold: { color: '#9e9e9e', textColor: '#1f2937', label: '無警戒值' },
  stale: { color: '#9e9e9e', textColor: '#1f2937', label: '資料過舊' },
  noData: { color: '#9e9e9e', textColor: '#1f2937', label: '無資料' },
}

/**
 * Marker style per status, shared by map markers and legend swatches so the three gray
 * states stay distinguishable. `stroke` undefined → default white outline.
 */
export type AlertStatusMarkerStyle = { fill: string; stroke?: string; dashArray?: string; radius: number }

export const ALERT_STATUS_MARKER_STYLE: Record<AlertStatus, AlertStatusMarkerStyle> = {
  critical: { fill: ALERT_STATUS_META.critical.color, radius: 6 },
  warning: { fill: ALERT_STATUS_META.warning.color, radius: 6 },
  normal: { fill: ALERT_STATUS_META.normal.color, radius: 6 },
  noThreshold: { fill: '#9e9e9e', radius: 6 },
  stale: { fill: '#ffffff', stroke: '#9e9e9e', dashArray: '3 2', radius: 6 },
  noData: { fill: '#cfcfcf', radius: 4 },
}

/** The three WRA alert levels, in panel and chart order. */
export const ALERT_LEVELS = [
  { key: 'alert1', shortLabel: '一級', label: '一級警戒', lineColor: '#d7301f' },
  { key: 'alert2', shortLabel: '二級', label: '二級警戒', lineColor: '#f28e2b' },
  { key: 'alert3', shortLabel: '三級', label: '三級警戒', lineColor: '#f2b701' },
] as const satisfies readonly { key: keyof AlertThresholds; shortLabel: string; label: string; lineColor: string }[]

export function computeAlertStatus(
  reading: WaterLevelReading | undefined,
  thresholds: AlertThresholds,
  now: number,
): AlertStatus {
  if (!reading || reading.waterLevelM === null) return 'noData'
  if (now - reading.observedAt > STALE_AFTER_MS) return 'stale'
  const { alert1, alert2, alert3 } = thresholds
  if (alert1 === null && alert2 === null && alert3 === null) return 'noThreshold'
  const level = reading.waterLevelM
  if (alert1 !== null && level >= alert1) return 'critical'
  if ((alert2 !== null && level >= alert2) || (alert3 !== null && level >= alert3)) return 'warning'
  return 'normal'
}
