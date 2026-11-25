import axios, { AxiosError, CanceledError } from 'axios'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { parseRealtimeWaterLevels, parseWraTime, fetchRealtimeWaterLevels, RealtimeUnavailableError } from '@/lib/realtime'
import { REALTIME_WATER_LEVEL_URL } from '@/lib/config'
import http from '@/api/axios'
import { abortAll, getTrackingStats } from '@/api/abortManager'
import { createDeferredAdapter, type DeferredCall } from '@tests/deferredAdapter'

let calls: DeferredCall[]
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  const d = createDeferredAdapter()
  calls = d.calls
  http.defaults.adapter = d.adapter
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  abortAll()
  vi.restoreAllMocks()
})

const row = (o: any) => ({ stationid: 'X', datetime: '2026-11-25T11:00:00', waterlevel: '1.87', ...o })

describe('parseWraTime', () => {
  it('treats as +08:00', () => {
    expect(parseWraTime('2026-11-25T11:00:00')).toBe(Date.parse('2026-11-25T11:00:00+08:00'))
  })
})

describe('parseRealtimeWaterLevels', () => {
  it('parses numeric string', () => {
    expect(parseRealtimeWaterLevels([row({})]).get('X')!.waterLevelM).toBe(1.87)
  })
  it('empty, null, non-numeric -> null', () => {
    expect(parseRealtimeWaterLevels([row({ waterlevel: '' })]).get('X')!.waterLevelM).toBeNull()
    expect(parseRealtimeWaterLevels([row({ waterlevel: null })]).get('X')!.waterLevelM).toBeNull()
    expect(parseRealtimeWaterLevels([row({ waterlevel: 'abc' })]).get('X')!.waterLevelM).toBeNull()
  })
  it('duplicate stationid keeps latest time', () => {
    const m = parseRealtimeWaterLevels([
      row({ waterlevel: '2', datetime: '2026-11-25T11:00:00' }),
      row({ waterlevel: '3', datetime: '2026-11-25T11:10:00' }),
      row({ waterlevel: '4', datetime: '2026-11-25T10:00:00' }),
    ])
    expect(m.size).toBe(1)
    expect(m.get('X')!.waterLevelM).toBe(3)
  })
  it('skips rows without stationid or valid time', () => {
    expect(parseRealtimeWaterLevels([{ waterlevel: '1', datetime: '2026-11-25T11:00:00' }, row({ datetime: 'bad' })]).size).toBe(0)
  })
})

describe('fetchRealtimeWaterLevels', () => {
  it('GETs REALTIME_WATER_LEVEL_URL with an AbortSignal and parses the array', async () => {
    const ctrl = new AbortController()
    const p = fetchRealtimeWaterLevels(ctrl.signal)
    await flush()
    expect(calls[0].config.url).toBe(REALTIME_WATER_LEVEL_URL)
    expect(calls[0].config.method).toBe('get')
    expect(calls[0].config.signal).toBeInstanceOf(AbortSignal)
    expect(calls[0].config.cancelPrevious).toBe(true)
    calls[0].respond([row({})])
    expect((await p).get('X')!.waterLevelM).toBe(1.87)
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })
  it('works without a caller signal', async () => {
    const p = fetchRealtimeWaterLevels()
    await flush()
    calls[0].respond([row({})])
    expect((await p).size).toBe(1)
  })
  it('html bot-challenge page (string body, 200) -> RealtimeUnavailableError', async () => {
    const p = fetchRealtimeWaterLevels()
    await flush()
    calls[0].respond('<html>challenge</html>')
    await expect(p).rejects.toBeInstanceOf(RealtimeUnavailableError)
  })
  it('HTTP 500 -> RealtimeUnavailableError', async () => {
    const p = fetchRealtimeWaterLevels()
    await flush()
    calls[0].fail(500)
    await expect(p).rejects.toBeInstanceOf(RealtimeUnavailableError)
  })
  it('network error -> RealtimeUnavailableError', async () => {
    const p = fetchRealtimeWaterLevels()
    await flush()
    calls[0].reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, calls[0].config))
    await expect(p).rejects.toBeInstanceOf(RealtimeUnavailableError)
  })
  it('invalid json string / non-array object -> RealtimeUnavailableError', async () => {
    const p1 = fetchRealtimeWaterLevels()
    await flush()
    calls[0].respond('nope')
    await expect(p1).rejects.toBeInstanceOf(RealtimeUnavailableError)
    const p2 = fetchRealtimeWaterLevels()
    await flush()
    calls[1].respond({})
    await expect(p2).rejects.toBeInstanceOf(RealtimeUnavailableError)
  })
})

describe('fetchRealtimeWaterLevels timeout / cancel', () => {
  it.each(['ECONNABORTED', 'ETIMEDOUT'])('timeout (%s) -> RealtimeUnavailableError, not a cancel', async (code) => {
    const p = fetchRealtimeWaterLevels(new AbortController().signal)
    await flush()
    calls[0].reject(new AxiosError('timeout of 30000ms exceeded', code, calls[0].config))
    const err = await p.catch((e) => e)
    expect(err).toBeInstanceOf(RealtimeUnavailableError)
    expect(axios.isCancel(err)).toBe(false)
  })
  it('caller abort -> DOMException AbortError', async () => {
    const c = new AbortController()
    const p = fetchRealtimeWaterLevels(c.signal)
    await flush()
    c.abort()
    const err = await p.catch((e) => e)
    expect(err).toBeInstanceOf(DOMException)
    expect(err).toMatchObject({ name: 'AbortError' })
  })
  it('already-aborted caller signal -> AbortError', async () => {
    const c = new AbortController()
    c.abort()
    await expect(fetchRealtimeWaterLevels(c.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('an adapter-level CanceledError maps to AbortError', async () => {
    const p = fetchRealtimeWaterLevels()
    await flush()
    calls[0].reject(new CanceledError(undefined, calls[0].config))
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('two overlapping calls -> the first is cancelled (cancelPrevious), the second resolves', async () => {
    const first = fetchRealtimeWaterLevels(new AbortController().signal)
    const firstAborted = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    const second = fetchRealtimeWaterLevels(new AbortController().signal)
    await flush()
    await firstAborted
    expect(calls[0].config.signal!.aborted).toBe(true)
    calls[1].respond([row({ waterlevel: '2.5' })])
    expect((await second).get('X')!.waterLevelM).toBe(2.5)
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })
})
