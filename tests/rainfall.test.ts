import axios, { AxiosError, CanceledError, type AxiosAdapter, type AxiosResponse } from 'axios'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  parseStationRainfall,
  fetchStationRainfall,
  RainUnavailableError,
  __resetRainfallCacheForTests,
} from '@/lib/rainfall'
import { RAINFALL_PROXY_PATH, RAINFALL_CACHE_TTL_MS } from '@/lib/config'
import http from '@/api/axios'
import { abortAll, getTrackingStats } from '@/api/abortManager'
import { createDeferredAdapter, type DeferredCall } from '@tests/deferredAdapter'

const fixture = () => ({
  version: '1',
  timeZone: '8.0',
  timeSeries: [
    {
      header: { locationId: 'C1140H001', missVal: '-999.0', units: 'mm' },
      events: [
        { date: '2026-11-24', time: '11:00:00', value: '0.23', flag: '0' },
        { date: '2026-11-24', time: '12:00:00', value: '-999.0', flag: '0' },
      ],
    },
    {
      header: { locationId: 'C2222H002', missVal: '-99', units: 'mm' },
      events: [
        { date: '2026-11-24', time: '11:00:00', value: '-99', flag: '0' },
        { date: '2026-11-24', time: '12:00:00', value: 'abc', flag: '0' },
        { date: '2026-11-24', time: '13:00:00', value: '', flag: '0' },
        { date: '2026-11-24', time: '14:00:00', value: '1.5', flag: '0' },
      ],
    },
  ],
})

/** Response body as the browser XHR adapter delivers it for responseType 'arraybuffer'. */
const bytes = (body: unknown): ArrayBuffer =>
  new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)).buffer as ArrayBuffer

const sig = () => new AbortController().signal
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Deferred adapter (responses resolved manually) wrapped in a spy that counts downloads. */
let calls: DeferredCall[]
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>
const signalOf = (i: number) => calls[i].config.signal as AbortSignal

/** Adapter that answers every request immediately, one `handler` per call (last one repeats). */
function autoAdapter(...handlers: ((config: Parameters<AxiosAdapter>[0]) => Promise<AxiosResponse>)[]) {
  let callIndex = 0
  adapter = vi.fn<AxiosAdapter>((config) => handlers[Math.min(callIndex++, handlers.length - 1)](config))
  http.defaults.adapter = adapter
}
const okWith = (body: unknown) => async (config: Parameters<AxiosAdapter>[0]): Promise<AxiosResponse> => ({
  data: bytes(body),
  status: 200,
  statusText: '',
  headers: {},
  config,
})
const failWith = (status: number) => async (config: Parameters<AxiosAdapter>[0]): Promise<AxiosResponse> => {
  throw new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_RESPONSE, config, null, {
    data: null,
    status,
    statusText: '',
    headers: {},
    config,
  })
}
const rejectWith = (error: unknown) => async (): Promise<AxiosResponse> => {
  throw error
}

beforeEach(() => {
  __resetRainfallCacheForTests()
  const deferred = createDeferredAdapter()
  calls = deferred.calls
  adapter = vi.fn<AxiosAdapter>(deferred.adapter)
  http.defaults.adapter = adapter
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  __resetRainfallCacheForTests()
  abortAll()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('parseStationRainfall', () => {
  it('maps values and missVal, time is +08:00', () => {
    expect(parseStationRainfall(fixture(), '1140H001')).toEqual([
      { observedAt: Date.parse('2026-11-24T11:00:00+08:00'), rainfallMm: 0.23 },
      { observedAt: Date.parse('2026-11-24T12:00:00+08:00'), rainfallMm: null },
    ])
  })
  it('custom missVal, non-numeric and empty -> null', () => {
    expect(parseStationRainfall(fixture(), '2222H002')!.map((point) => point.rainfallMm)).toEqual([null, null, null, 1.5])
  })
  it('header without missVal keeps a real 0 mm (only -999 is missing)', () => {
    const dataset = {
      timeSeries: [
        {
          header: { locationId: 'C3333H003', units: 'mm' },
          events: [
            { date: '2026-11-24', time: '11:00:00', value: '0', flag: '0' },
            { date: '2026-11-24', time: '12:00:00', value: '-999', flag: '0' },
          ],
        },
      ],
    }
    expect(parseStationRainfall(dataset, '3333H003')).toEqual([
      { observedAt: Date.parse('2026-11-24T11:00:00+08:00'), rainfallMm: 0 },
      { observedAt: Date.parse('2026-11-24T12:00:00+08:00'), rainfallMm: null },
    ])
  })
  it('unknown station -> null', () => {
    expect(parseStationRainfall(fixture(), 'NOPE')).toBeNull()
  })
  it('malformed payload -> null', () => {
    expect(parseStationRainfall({}, '1140H001')).toBeNull()
    expect(parseStationRainfall(null, '1140H001')).toBeNull()
  })
})

describe('fetchStationRainfall request', () => {
  it('GETs RAINFALL_PROXY_PATH as arraybuffer, without cancelPrevious, and untracks after', async () => {
    const pending = fetchStationRainfall('1140H001', sig())
    await flush()
    expect(calls[0].config.url).toBe(RAINFALL_PROXY_PATH)
    expect(calls[0].config.method).toBe('get')
    expect(calls[0].config.responseType).toBe('arraybuffer')
    expect(calls[0].config.cancelPrevious).toBeFalsy()
    calls[0].respond(bytes(fixture()))
    expect(await pending).toHaveLength(2)
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })
})

describe('fetchStationRainfall errors', () => {
  it('html bot page with 200 -> RainUnavailableError', async () => {
    autoAdapter(okWith('<html>challenge</html>'))
    await expect(fetchStationRainfall('1140H001', sig())).rejects.toBeInstanceOf(RainUnavailableError)
  })
  it('404 -> RainUnavailableError', async () => {
    autoAdapter(failWith(404))
    await expect(fetchStationRainfall('1140H001', sig())).rejects.toBeInstanceOf(RainUnavailableError)
  })
  it('invalid json / wrong shape -> RainUnavailableError', async () => {
    autoAdapter(okWith('nope'), okWith({ foo: 1 }))
    await expect(fetchStationRainfall('1140H001', sig())).rejects.toBeInstanceOf(RainUnavailableError)
    await expect(fetchStationRainfall('1140H001', sig())).rejects.toBeInstanceOf(RainUnavailableError)
  })
  it('network failure -> RainUnavailableError', async () => {
    autoAdapter((config) => rejectWith(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config))())
    await expect(fetchStationRainfall('1140H001', sig())).rejects.toBeInstanceOf(RainUnavailableError)
  })
  it('failed download is not cached; next call fetches again', async () => {
    autoAdapter(failWith(500), okWith(fixture()))
    await expect(fetchStationRainfall('1140H001', sig())).rejects.toBeInstanceOf(RainUnavailableError)
    expect(await fetchStationRainfall('1140H001', sig())).toHaveLength(2)
    expect(adapter).toHaveBeenCalledTimes(2)
  })
  it('already-aborted signal rejects AbortError without downloading', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(fetchStationRainfall('1140H001', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    expect(adapter).not.toHaveBeenCalled()
  })
})

describe('fetchStationRainfall timeout', () => {
  it.each(['ECONNABORTED', 'ETIMEDOUT'])('download timeout (%s) -> RainUnavailableError, not AbortError', async (code) => {
    const pending = fetchStationRainfall('1010H006', sig())
    await flush()
    calls[0].reject(new AxiosError('timeout of 30000ms exceeded', code, calls[0].config))
    const rejection = await pending.catch((error) => error)
    expect(rejection).toBeInstanceOf(RainUnavailableError)
    expect(axios.isCancel(rejection)).toBe(false)
  })
})

/** fixture() serialized as ASCII, with header.stationName = given raw bytes (e.g. Big5). */
function bytesWithStationName(nameBytes: number[]): ArrayBuffer {
  const dataset = fixture()
  ;(dataset.timeSeries[0].header as Record<string, string>).stationName = '@@NAME@@'
  const [pre, post] = JSON.stringify(dataset).split('@@NAME@@')
  const encoder = new TextEncoder()
  return new Uint8Array([...encoder.encode(pre), ...nameBytes, ...encoder.encode(post)]).buffer
}

describe('fetchStationRainfall encoding', () => {
  it('decodes a Big5 arraybuffer whose trail byte 0x5C would break UTF-8 JSON', async () => {
    // "許" in Big5 = 0xB3 0x5C; 0x5C is "\" and invalidates JSON as UTF-8.
    const body = bytesWithStationName([0xb3, 0x5c])
    expect(() => JSON.parse(new TextDecoder('utf-8').decode(body))).toThrow()
    autoAdapter(async (config) => ({ data: body, status: 200, statusText: '', headers: {}, config }))
    const series = await fetchStationRainfall('1140H001', sig())
    expect(series!.map((point) => point.rainfallMm)).toEqual([0.23, null])
  })
  it('UTF-8 body (WRA fixed encoding) still parses', async () => {
    const body = bytesWithStationName([...new TextEncoder().encode('玉峰')])
    autoAdapter(async (config) => ({ data: body, status: 200, statusText: '', headers: {}, config }))
    expect(await fetchStationRainfall('1140H001', sig())).toHaveLength(2)
  })
  it('falls back to UTF-8 when Big5 decoding is unavailable/throws', async () => {
    const Real = TextDecoder
    const decoders: string[] = []
    vi.stubGlobal('TextDecoder', class extends Real {
      constructor(label?: string, opts?: TextDecoderOptions) {
        decoders.push(label ?? 'utf-8')
        if (label === 'big5') throw new RangeError('unsupported')
        super(label, opts)
      }
    })
    autoAdapter(okWith(fixture()))
    expect(await fetchStationRainfall('1140H001', sig())).toHaveLength(2)
    expect(decoders).toEqual(['big5', 'utf-8'])
  })
  it('neither decoding parses -> RainUnavailableError', async () => {
    autoAdapter(okWith('<html>challenge</html>'))
    await expect(fetchStationRainfall('1140H001', sig())).rejects.toBeInstanceOf(RainUnavailableError)
  })
  it('a cancel we did not cause -> RainUnavailableError', async () => {
    const pending = fetchStationRainfall('1140H001', sig())
    await flush()
    calls[0].reject(new CanceledError(undefined, calls[0].config))
    await expect(pending).rejects.toBeInstanceOf(RainUnavailableError)
  })
})

describe('__resetRainfallCacheForTests', () => {
  it('aborts the in-flight download so it cannot populate the cache later', async () => {
    const resultA = fetchStationRainfall('1140H001', sig())
    resultA.catch(() => {})
    await flush()
    __resetRainfallCacheForTests()
    expect(signalOf(0).aborted).toBe(true)
    calls[0].respond(bytes(fixture())) // ignored: already cancelled
    await flush()
    const resultB = fetchStationRainfall('1140H001', sig())
    await flush()
    expect(adapter).toHaveBeenCalledTimes(2)
    calls[1].respond(bytes(fixture()))
    await resultB
  })
})

describe('fetchStationRainfall cache', () => {
  it('fetches RAINFALL_PROXY_PATH, returns null for station absent from dataset', async () => {
    autoAdapter(okWith(fixture()))
    expect(await fetchStationRainfall('NOPE', sig())).toBeNull()
    expect(adapter.mock.calls[0][0].url).toBe(RAINFALL_PROXY_PATH)
  })
  it('caches dataset for RAINFALL_CACHE_TTL_MS, refetches after expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-11-25T10:00:00+08:00'))
    autoAdapter(okWith(fixture()))
    await fetchStationRainfall('1140H001', sig())
    expect(await fetchStationRainfall('2222H002', sig())).toHaveLength(4)
    expect(adapter).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + RAINFALL_CACHE_TTL_MS - 1)
    await fetchStationRainfall('1140H001', sig())
    expect(adapter).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 2)
    await fetchStationRainfall('1140H001', sig())
    expect(adapter).toHaveBeenCalledTimes(2)
  })
})

describe('fetchStationRainfall in-flight sharing', () => {
  it('A and B share one download; A aborting only detaches A', async () => {
    const callerA = new AbortController()
    const callerB = new AbortController()
    const resultA = fetchStationRainfall('1140H001', callerA.signal)
    const resultB = fetchStationRainfall('2222H002', callerB.signal)
    await flush()
    expect(adapter).toHaveBeenCalledTimes(1)
    const internal = signalOf(0)
    expect(internal).not.toBe(callerA.signal)
    expect(internal).not.toBe(callerB.signal)

    callerA.abort()
    await expect(resultA).rejects.toMatchObject({ name: 'AbortError' })
    expect(internal.aborted).toBe(false)

    calls[0].respond(bytes(fixture()))
    expect(await resultB).toHaveLength(4)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('only waiter aborts -> internal download aborted (deferred), cache not populated', async () => {
    const callerA = new AbortController()
    const resultA = fetchStationRainfall('1140H001', callerA.signal)
    await flush()
    callerA.abort()
    await expect(resultA).rejects.toMatchObject({ name: 'AbortError' })
    // internal abort is deferred one macrotask (grace for a joining caller)
    expect(signalOf(0).aborted).toBe(false)
    await flush()
    expect(signalOf(0).aborted).toBe(true)
    calls[0].respond(bytes(fixture())) // late response after cancel is ignored
    await flush()

    const resultC = fetchStationRainfall('1140H001', sig())
    await flush()
    expect(adapter).toHaveBeenCalledTimes(2)
    calls[1].respond(bytes(fixture()))
    expect(await resultC).toHaveLength(2)
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })

  it('both waiters abort -> internal aborted; next call starts fresh', async () => {
    const callerA = new AbortController()
    const callerB = new AbortController()
    const resultA = fetchStationRainfall('1140H001', callerA.signal)
    const resultB = fetchStationRainfall('1140H001', callerB.signal)
    await flush()
    callerA.abort()
    expect(signalOf(0).aborted).toBe(false)
    callerB.abort()
    await expect(resultA).rejects.toMatchObject({ name: 'AbortError' })
    await expect(resultB).rejects.toMatchObject({ name: 'AbortError' })
    expect(signalOf(0).aborted).toBe(false)
    await flush()
    expect(signalOf(0).aborted).toBe(true)
    await flush()

    const resultC = fetchStationRainfall('1140H001', sig())
    await flush()
    expect(adapter).toHaveBeenCalledTimes(2)
    calls[1].respond(bytes(fixture()))
    expect(await resultC).toHaveLength(2)
  })

  it('A aborts, B joins synchronously (latest-request guard switch) -> download reused', async () => {
    const callerA = new AbortController()
    const resultA = fetchStationRainfall('1140H001', callerA.signal)
    callerA.abort()
    const resultB = fetchStationRainfall('2222H002', sig())
    await expect(resultA).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(signalOf(0).aborted).toBe(false)
    calls[0].respond(bytes(fixture()))
    expect(await resultB).toHaveLength(4)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('B joins in a microtask after A aborts -> download reused', async () => {
    const callerA = new AbortController()
    fetchStationRainfall('1140H001', callerA.signal).catch(() => {})
    callerA.abort()
    await Promise.resolve()
    const resultB = fetchStationRainfall('1140H001', sig())
    await flush()
    expect(signalOf(0).aborted).toBe(false)
    calls[0].respond(bytes(fixture()))
    expect(await resultB).toHaveLength(2)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('A aborts, timers advance with no joiner -> internal aborted, next call refetches (fake timers)', async () => {
    vi.useFakeTimers()
    const callerA = new AbortController()
    const resultA = fetchStationRainfall('1140H001', callerA.signal)
    await vi.advanceTimersByTimeAsync(0) // let axios reach the adapter
    callerA.abort()
    await expect(resultA).rejects.toMatchObject({ name: 'AbortError' })
    expect(signalOf(0).aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(signalOf(0).aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(0)

    const resultC = fetchStationRainfall('1140H001', sig())
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter).toHaveBeenCalledTimes(2)
    calls[1].respond(bytes(fixture()))
    expect(await resultC).toHaveLength(2)
  })

  it('shared failure rejects every waiter with RainUnavailableError', async () => {
    const resultA = fetchStationRainfall('1140H001', sig())
    const resultB = fetchStationRainfall('2222H002', sig())
    await flush()
    calls[0].respond(bytes('<html/>'))
    await expect(resultA).rejects.toBeInstanceOf(RainUnavailableError)
    await expect(resultB).rejects.toBeInstanceOf(RainUnavailableError)
  })
})
