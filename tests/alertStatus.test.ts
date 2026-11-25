import { describe, it, expect } from 'vitest'
import { computeAlertStatus, ALERT_STATUS_META } from '@/lib/alertStatus'

const now = Date.parse('2026-11-25T12:00:00+08:00')
const fresh = Date.parse('2026-11-25T11:00:00+08:00')
const reading = (waterLevelM: number | null, observedAt = fresh) => ({ waterLevelM, observedAt })
const thresholds = { alert1: 5.8, alert2: 4.6, alert3: null }

describe('computeAlertStatus', () => {
  it('critical / warning / normal by thresholds', () => {
    expect(computeAlertStatus(reading(6.0), thresholds, now)).toBe('critical')
    expect(computeAlertStatus(reading(5.0), thresholds, now)).toBe('warning')
    expect(computeAlertStatus(reading(4.0), thresholds, now)).toBe('normal')
  })
  it('only alert2 defined', () => {
    const onlyAlert2 = { alert1: null, alert2: 25.75, alert3: null }
    expect(computeAlertStatus(reading(26), onlyAlert2, now)).toBe('warning')
    expect(computeAlertStatus(reading(20), onlyAlert2, now)).toBe('normal')
  })
  it('noThreshold when all alerts null', () => {
    expect(computeAlertStatus(reading(3), { alert1: null, alert2: null, alert3: null }, now)).toBe('noThreshold')
  })
  it('stale takes precedence over critical', () => {
    expect(computeAlertStatus(reading(6.0, now - 4 * 3600_000), thresholds, now)).toBe('stale')
  })
  it('noData when reading undefined or level null', () => {
    expect(computeAlertStatus(undefined, thresholds, now)).toBe('noData')
    expect(computeAlertStatus(reading(null), thresholds, now)).toBe('noData')
  })
  it('ALERT_STATUS_META labels', () => {
    expect(ALERT_STATUS_META.critical.label).toBe('一級警戒')
    expect(ALERT_STATUS_META.warning.label).toBe('二三級警戒')
    expect(ALERT_STATUS_META.normal.label).toBe('正常')
    expect(ALERT_STATUS_META.noThreshold.label).toBe('無警戒值')
    expect(ALERT_STATUS_META.stale.label).toBe('資料過舊')
    expect(ALERT_STATUS_META.noData.label).toBe('無資料')
    expect(ALERT_STATUS_META.critical.color).toBe('#d7301f')
    expect(ALERT_STATUS_META.critical.textColor).toBe('#ffffff')
    expect(ALERT_STATUS_META.normal.textColor).toBe('#ffffff')
    for (const status of ['warning', 'noThreshold', 'stale', 'noData'] as const)
      expect(ALERT_STATUS_META[status].textColor).toBe('#1f2937')
  })
})
