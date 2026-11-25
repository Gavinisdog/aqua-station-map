import axios, { type AxiosAdapter } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abortAll, abortKey, getTrackingStats } from '@/api/abortManager'
import http from '@/api/axios'
import { createDeferredAdapter, type DeferredCall } from '@tests/deferredAdapter'

const flush = () => new Promise((resolve) => setTimeout(resolve))

let adapter: AxiosAdapter
let calls: DeferredCall[]

beforeEach(() => {
  ;({ adapter, calls } = createDeferredAdapter())
  http.defaults.adapter = adapter
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  abortAll()
  vi.restoreAllMocks()
})

describe('http instance', () => {
  it('has a 30 s timeout and no baseURL', () => {
    expect(http.defaults.timeout).toBe(30_000)
    expect(http.defaults.baseURL).toBeUndefined()
  })

  it('always tracks under "method path" (query stripped), even with a caller signal', async () => {
    const caller = new AbortController()
    const req = http.get('/data?x=1', { signal: caller.signal })
    await flush()
    expect(getTrackingStats()).toEqual({ controllers: 1, keys: 1 })
    abortKey('get /data')
    await expect(req).rejects.toSatisfy(axios.isCancel)
  })
})

describe('cancelPrevious', () => {
  it('(a) a newer same-key request cancels the older one; the newer resolves', async () => {
    const first = http.get('/data?q=1', { cancelPrevious: true })
    const firstCanceled = expect(first).rejects.toSatisfy(axios.isCancel)
    await flush()
    const second = http.get('/data?q=2', { cancelPrevious: true })
    await flush()
    await firstCanceled
    calls[1].respond([1])
    await expect(second).resolves.toMatchObject({ data: [1] })
  })

  it('(b) caller abort cancels the request', async () => {
    const caller = new AbortController()
    const req = http.get('/data', { signal: caller.signal, cancelPrevious: true })
    await flush()
    caller.abort()
    await expect(req).rejects.toSatisfy(axios.isCancel)
  })

  it('(b) a newer same-key request still cancels an older one that has a caller signal', async () => {
    const caller = new AbortController()
    const first = http.get('/data', { signal: caller.signal, cancelPrevious: true })
    const firstCanceled = expect(first).rejects.toSatisfy(axios.isCancel)
    await flush()
    const second = http.get('/data', { signal: new AbortController().signal, cancelPrevious: true })
    await flush()
    await firstCanceled
    expect(caller.signal.aborted).toBe(false) // never touches the caller's controller
    calls[1].respond('ok')
    await expect(second).resolves.toMatchObject({ data: 'ok' })
  })

  it('(c) an already-aborted caller signal cancels immediately without reaching the adapter', async () => {
    const caller = new AbortController()
    caller.abort()
    await expect(http.get('/data', { signal: caller.signal })).rejects.toSatisfy(axios.isCancel)
    expect(calls).toHaveLength(0)
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })

  it('(e) a different path is not cancelled', async () => {
    const other = http.get('/other', { cancelPrevious: true })
    await flush()
    const data = http.get('/data', { cancelPrevious: true })
    await flush()
    calls[0].respond('o')
    calls[1].respond('d')
    await expect(Promise.all([other, data])).resolves.toHaveLength(2)
  })

  it('without cancelPrevious, same-key requests do not cancel each other', async () => {
    const a = http.get('/data')
    const b = http.get('/data')
    await flush()
    calls[0].respond(1)
    calls[1].respond(2)
    await expect(Promise.all([a, b])).resolves.toHaveLength(2)
  })
})

describe('(d) no leaks', () => {
  it('untracks after resolve, reject and cancel', async () => {
    const ok = http.get('/a')
    const bad = http.get('/b')
    const canceled = http.get('/c')
    const caller = new AbortController()
    const callerCanceled = http.get('/d', { signal: caller.signal })
    await flush()
    expect(getTrackingStats()).toEqual({ controllers: 4, keys: 4 })
    calls[0].respond({})
    calls[1].fail(503)
    abortKey('get /c')
    caller.abort()
    await Promise.allSettled([ok, bad, canceled, callerCanceled])
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })

  it('removes the forwarding listener from the caller signal once the request settles', async () => {
    for (const settle of ['respond', 'fail', 'cancel'] as const) {
      const caller = new AbortController()
      const add = vi.spyOn(caller.signal, 'addEventListener')
      const remove = vi.spyOn(caller.signal, 'removeEventListener')
      const req = http.get(`/l-${settle}`, { signal: caller.signal, cancelPrevious: true })
      await flush()
      expect(add).toHaveBeenCalledTimes(1)
      const listener = add.mock.calls[0][1]
      if (settle === 'respond') calls.at(-1)!.respond(1)
      else if (settle === 'fail') calls.at(-1)!.fail(500)
      else abortKey(`get /l-${settle}`)
      await Promise.allSettled([req])
      expect(remove).toHaveBeenCalledWith('abort', listener)
    }
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })

  it('does not console.error an expected cancel', async () => {
    const req = http.get('/data')
    await flush()
    abortKey('get /data')
    await Promise.allSettled([req])
    expect(console.error).not.toHaveBeenCalled()
  })
})
