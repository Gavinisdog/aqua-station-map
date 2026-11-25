import { describe, it, expect } from 'vitest'
import {
  buildStationChartOption,
  CHART_WINDOW_MS,
  timeAxisRange,
  waterLevelAxisRange,
} from '@/lib/chartOptions'
import { HOUR_MS } from '@/lib/config'

const now = Date.parse('2026-11-25T12:00:00+08:00')
const reading = (waterLevelM: number | null, observedAt = now - HOUR_MS) => ({ waterLevelM, observedAt })
const noThresholds = { alert1: null, alert2: null, alert3: null }

describe('timeAxisRange', () => {
  it('few recent points -> window is now − 25 h .. now', () => {
    expect(CHART_WINDOW_MS).toBe(25 * HOUR_MS)
    expect(timeAxisRange([reading(1.2)], now)).toEqual({ min: now - 25 * HOUR_MS, max: now })
    expect(timeAxisRange([], now)).toEqual({ min: now - 25 * HOUR_MS, max: now })
  })
  it('readings outside the window widen it', () => {
    const older = now - 30 * HOUR_MS
    const later = now + HOUR_MS
    expect(timeAxisRange([reading(1, older)], now)).toEqual({ min: older, max: now })
    expect(timeAxisRange([reading(1, later)], now)).toEqual({ min: now - 25 * HOUR_MS, max: later })
  })
})

describe('waterLevelAxisRange', () => {
  it('no data -> 0..1 padded by the 0.2 m minimum', () => {
    expect(waterLevelAxisRange([], noThresholds)).toEqual({ min: -0.2, max: 1.2 })
  })
  it('levels only: pads 10% of the span (at least 0.2 m), rounded to cm', () => {
    expect(waterLevelAxisRange([reading(1), reading(2)], noThresholds)).toEqual({ min: 0.8, max: 2.2 })
    expect(waterLevelAxisRange([reading(0), reading(10)], noThresholds)).toEqual({ min: -1, max: 11 })
  })
  it('alert thresholds widen the range', () => {
    const thresholds = { alert1: 5, alert2: null, alert3: 0.5 }
    expect(waterLevelAxisRange([reading(1), reading(2)], thresholds)).toEqual({ min: 0.05, max: 5.45 })
  })
})

type SeriesOption = {
  type: string
  yAxisIndex: number
  markLine?: { data: { name: string; yAxis: number; label: { formatter: string } }[] }
}
type ChartOption = { grid: { right: number }; series: SeriesOption[] }

const build = (overrides: Partial<Parameters<typeof buildStationChartOption>[0]> = {}) =>
  buildStationChartOption({
    thresholds: noThresholds,
    history: [reading(1.2)],
    now,
    ...overrides,
  }) as unknown as ChartOption

describe('buildStationChartOption', () => {
  it('draws a single water-level line series on one y axis', () => {
    const option = build()
    expect(option.series.map((series) => [series.type, series.yAxisIndex])).toEqual([['line', 0]])
    expect(option.grid.right).toBe(16)
  })
  it('markLine has one entry per non-null threshold, with label and value', () => {
    const option = build({ thresholds: { alert1: 5.8, alert2: null, alert3: 3.2 } })
    const lines = option.series[0].markLine!.data
    expect(lines.map((line) => [line.name, line.yAxis, line.label.formatter])).toEqual([
      ['一級警戒', 5.8, '一級警戒 5.8 m'],
      ['三級警戒', 3.2, '三級警戒 3.2 m'],
    ])
  })
})
