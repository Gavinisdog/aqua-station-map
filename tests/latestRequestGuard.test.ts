import { describe, it, expect, vi, afterEach } from 'vitest'
import { createLatestRequestGuard } from '@/lib/latestRequestGuard'

afterEach(() => vi.useRealTimers())

const abortError = () => new DOMException('Aborted', 'AbortError')

/** Task that resolves `value` after `ms`, ignoring its signal entirely. */
const ignoring = <T>(value: T, ms: number) => () => new Promise<T>((r) => setTimeout(() => r(value), ms))

/** Task that rejects AbortError when its signal aborts, else resolves after ms. */
const honoring = <T>(value: T, ms: number, seen?: { signal?: AbortSignal }) => (signal: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    if (seen) seen.signal = signal
    const id = setTimeout(() => resolve(value), ms)
    signal.addEventListener('abort', () => {
      clearTimeout(id)
      reject(abortError())
    })
  })

describe('createLatestRequestGuard', () => {
  it('slow A (ignores abort) arriving after B is stale; B wins', async () => {
    vi.useFakeTimers()
    const latest = createLatestRequestGuard<string>()
    const pa = latest.run(ignoring('A', 50))
    const pb = latest.run(ignoring('B', 10))
    await vi.advanceTimersByTimeAsync(10)
    expect(await pb).toEqual({ ok: true, value: 'B' })
    await vi.advanceTimersByTimeAsync(40)
    expect(await pa).toEqual({ ok: false, stale: true })
  })

  it('new run aborts previous signal before it settles; AbortError -> stale', async () => {
    vi.useFakeTimers()
    const latest = createLatestRequestGuard<string>()
    const seenA: { signal?: AbortSignal } = {}
    let aSettled = false
    const pa = latest.run(honoring('A', 50, seenA)).finally(() => (aSettled = true))
    expect(seenA.signal!.aborted).toBe(false)
    const pb = latest.run(honoring('B', 10))
    expect(seenA.signal!.aborted).toBe(true)
    expect(aSettled).toBe(false)
    expect(await pa).toEqual({ ok: false, stale: true })
    await vi.advanceTimersByTimeAsync(10)
    expect(await pb).toEqual({ ok: true, value: 'B' })
  })

  it('abort() aborts current signal; its result is stale even if task ignores abort', async () => {
    vi.useFakeTimers()
    const latest = createLatestRequestGuard<string>()
    let sig: AbortSignal | undefined
    const p = latest.run((s) => {
      sig = s
      return new Promise((r) => setTimeout(() => r('X'), 10))
    })
    latest.abort()
    expect(sig!.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(await p).toEqual({ ok: false, stale: true })
  })

  it('abort() with abort-honoring task -> stale', async () => {
    const latest = createLatestRequestGuard<string>()
    const p = latest.run(honoring('X', 1000))
    latest.abort()
    expect(await p).toEqual({ ok: false, stale: true })
  })

  it('current run non-abort error -> {ok:false, stale:false, error}', async () => {
    const latest = createLatestRequestGuard<string>()
    const err = new Error('boom')
    expect(await latest.run(() => Promise.reject(err))).toEqual({ ok: false, stale: false, error: err })
  })

  it('synchronous throw in task is reported, run() never rejects', async () => {
    const latest = createLatestRequestGuard<string>()
    const err = new Error('sync')
    expect(await latest.run(() => { throw err })).toEqual({ ok: false, stale: false, error: err })
  })

  it('superseded run rejecting a non-abort error -> stale (not reported)', async () => {
    vi.useFakeTimers()
    const latest = createLatestRequestGuard<string>()
    const pa = latest.run(() => new Promise((_, rej) => setTimeout(() => rej(new Error('late')), 50)))
    const pb = latest.run(ignoring('B', 10))
    await vi.advanceTimersByTimeAsync(50)
    expect(await pb).toEqual({ ok: true, value: 'B' })
    expect(await pa).toEqual({ ok: false, stale: true })
  })

  it('sequential runs each succeed', async () => {
    const latest = createLatestRequestGuard<number>()
    expect(await latest.run(async () => 1)).toEqual({ ok: true, value: 1 })
    expect(await latest.run(async () => 2)).toEqual({ ok: true, value: 2 })
  })
})
