import { describe, it, expect } from 'vitest'
import {
  buildStationChartOption,
  MIN_TIME_PADDING_MS,
  MIN_TIME_SPAN_MS,
  timeAxisRange,
  waterLevelAxisRange,
} from '@/lib/chartOptions'
import { HOUR_MS, MINUTE_MS } from '@/lib/config'

const now = Date.parse('2026-11-25T12:00:00+08:00')
const reading = (waterLevelM: number | null, observedAt = now - HOUR_MS) => ({ waterLevelM, observedAt })
const noThresholds = { alert1: null, alert2: null, alert3: null }

describe('timeAxisRange', () => {
  it('uses a 10-minute minimum margin and a 1-hour minimum window', () => {
    expect(MIN_TIME_PADDING_MS).toBe(10 * MINUTE_MS)
    expect(MIN_TIME_SPAN_MS).toBe(HOUR_MS)
  })
  it('no readings -> the last hour', () => {
    expect(timeAxisRange([], now)).toEqual({ min: now - HOUR_MS, max: now })
  })
  it('one reading -> a 1-hour window centered on it', () => {
    const at = now - 2 * HOUR_MS
    expect(timeAxisRange([reading(1, at)], now)).toEqual({ min: at - 30 * MINUTE_MS, max: at + 30 * MINUTE_MS })
  })
  it('readings close together -> widened to 1 hour around their middle', () => {
    const first = now - 40 * MINUTE_MS
    const last = now - 10 * MINUTE_MS
    const middle = (first + last) / 2
    expect(timeAxisRange([reading(1, last), reading(1, first)], now)).toEqual({
      min: middle - 30 * MINUTE_MS,
      max: middle + 30 * MINUTE_MS,
    })
  })
  it('long history -> fits the readings plus 10% of their span on each side', () => {
    const first = now - 6 * HOUR_MS
    const last = now - 10 * MINUTE_MS
    const padding = (last - first) * 0.1
    expect(timeAxisRange([reading(1, first), reading(1, last)], now)).toEqual({
      min: first - padding,
      max: last + padding,
    })
  })
  it('does not stretch to "now" when the latest reading is older', () => {
    const first = now - 5 * HOUR_MS
    const last = now - 3 * HOUR_MS
    expect(timeAxisRange([reading(1, first), reading(1, last)], now).max).toBeLessThan(now)
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
type ChartOption = {
  grid: { right: number }
  xAxis: { min: number; max: number; minInterval: number; axisLabel: { hideOverlap: boolean } }
  series: SeriesOption[]
}

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
  it('x axis fits the readings, labels at most every 10 min without overlap', () => {
    const option = build()
    expect(option.xAxis).toMatchObject(timeAxisRange([reading(1.2)], now))
    expect(option.xAxis.minInterval).toBe(MIN_TIME_PADDING_MS)
    expect(option.xAxis.axisLabel.hideOverlap).toBe(true)
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
