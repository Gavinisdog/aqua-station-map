import { describe, it, expect } from 'vitest'
import { toWgs84, parseAlert, toFeatureCollection } from '@scripts/stations-lib.ts'

describe('toWgs84', () => {
  it('converts TWD97 xy to lon/lat', () => {
    const r = toWgs84('313411.44 2790930.63')!
    expect(r[0]).toBeCloseTo(121.63, 1)
    expect(Math.abs(r[0] - 121.63)).toBeLessThan(0.05)
    expect(Math.abs(r[1] - 25.22)).toBeLessThan(0.05)
  })
  it('returns null for empty or garbage', () => {
    expect(toWgs84('')).toBeNull()
    expect(toWgs84('abc')).toBeNull()
  })
})

describe('parseAlert', () => {
  it('parses numbers and blanks', () => {
    expect(parseAlert('5.8')).toBe(5.8)
    expect(parseAlert('')).toBeNull()
  })
})

describe('toFeatureCollection', () => {
  it('drops rows without coords and maps fields', () => {
    const fc = toFeatureCollection([
      { basinidentifier: '1010H006', observatoryname: 'A', rivername: 'R', alertlevel1: '5.8', alertlevel2: '', alertlevel3: '', locationbytwd97_xy: '313411.44 2790930.63' },
      { basinidentifier: 'X', observatoryname: 'B', rivername: 'R2', alertlevel1: '', alertlevel2: '', alertlevel3: '', locationbytwd97_xy: '' },
    ])
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].properties).toEqual({ id: '1010H006', name: 'A', river: 'R', alert1: 5.8, alert2: null, alert3: null })
    expect(fc.features[0].geometry.type).toBe('Point')
  })
  it('skips rows without basinidentifier', () => {
    const fc = toFeatureCollection([
      { basinidentifier: '', observatoryname: 'A', rivername: 'R', locationbytwd97_xy: '313411.44 2790930.63' },
      { observatoryname: 'B', rivername: 'R', locationbytwd97_xy: '313411.44 2790930.63' },
    ])
    expect(fc.features).toHaveLength(0)
  })
})
