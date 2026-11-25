import { describe, it, expect } from 'vitest'
import { appendToHistory } from '@/lib/history'
import type { WaterLevelReading } from '@/lib/realtime'

/** A one-station snapshot, as returned by a realtime poll. */
const snapshotOf = (waterLevelM: number | null, observedAt: number) =>
  new Map<string, WaterLevelReading>([['X', { waterLevelM, observedAt }]])

describe('appendToHistory', () => {
  it('dedupes same time, appends newer sorted', () => {
    const historyByStation = new Map<string, WaterLevelReading[]>()
    appendToHistory(historyByStation, snapshotOf(1, 1000))
    appendToHistory(historyByStation, snapshotOf(1, 1000))
    expect(historyByStation.get('X')).toHaveLength(1)
    appendToHistory(historyByStation, snapshotOf(2, 2000))
    expect(historyByStation.get('X')!.map((reading) => reading.observedAt)).toEqual([1000, 2000])
  })
  it('inserts out-of-order sorted ascending', () => {
    const historyByStation = new Map<string, WaterLevelReading[]>()
    appendToHistory(historyByStation, snapshotOf(2, 2000))
    appendToHistory(historyByStation, snapshotOf(1, 1000))
    expect(historyByStation.get('X')!.map((reading) => reading.observedAt)).toEqual([1000, 2000])
  })
  it('skips null level', () => {
    const historyByStation = new Map<string, WaterLevelReading[]>()
    appendToHistory(historyByStation, snapshotOf(null, 1000))
    expect(historyByStation.get('X')).toBeUndefined()
  })
  it('caps at max', () => {
    const historyByStation = new Map<string, WaterLevelReading[]>()
    for (let i = 1; i <= 5; i++) appendToHistory(historyByStation, snapshotOf(i, i * 1000), 3)
    expect(historyByStation.get('X')!.map((reading) => reading.observedAt)).toEqual([3000, 4000, 5000])
  })
})
