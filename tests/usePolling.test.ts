// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { usePolling } from '@/composables/usePolling'

afterEach(() => {
  vi.useRealTimers()
  setHidden(false)
})

const abortError = () => new DOMException('Aborted', 'AbortError')

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

/** Mocked task: each call resolves the next value after `ms`, rejecting AbortError on abort. */
function mockTask(values: string[], ms: number) {
  const signals: AbortSignal[] = []
  let i = 0
  const task = vi.fn((signal: AbortSignal) => {
    signals.push(signal)
    const value = values[i++]
    return new Promise<string>((resolve, reject) => {
      const id = setTimeout(() => resolve(value), ms)
      signal.addEventListener('abort', () => {
        clearTimeout(id)
        reject(abortError())
      })
    })
  })
  return { task, signals }
}

function start<T>(task: (s: AbortSignal) => Promise<T>, onData: (v: T) => void, ms: number) {
  const scope = effectScope()
  const api = scope.run(() => usePolling(task, onData, ms))!
  return { scope, api }
}

describe('usePolling', () => {
  it('refresh while a tick is in flight aborts the first; onData called once with the second value', async () => {
    vi.useFakeTimers()
    const { task, signals } = mockTask(['first', 'second'], 100)
    const onData = vi.fn()
    const { scope, api } = start(task, onData, 1000)

    expect(task).toHaveBeenCalledTimes(1) // initial tick in flight
    const p = api.refresh()
    expect(signals[0].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    await p

    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith('second')
    expect(api.lastUpdated.value).not.toBeNull()
    scope.stop()
  })

  it('stale result is dropped even if the task ignores its signal', async () => {
    vi.useFakeTimers()
    let n = 0
    const task = vi.fn(() => {
      const v = ++n
      return new Promise<number>((r) => setTimeout(() => r(v), v === 1 ? 300 : 50))
    })
    const onData = vi.fn()
    const { scope, api } = start(task, onData, 10_000)
    void api.refresh()
    await vi.advanceTimersByTimeAsync(300)
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith(2)
    scope.stop()
  })

  it('dispose aborts the in-flight request and never calls onData', async () => {
    vi.useFakeTimers()
    const { task, signals } = mockTask(['first'], 100)
    const onData = vi.fn()
    const { scope } = start(task, onData, 1000)

    scope.stop()
    expect(signals[0].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(onData).not.toHaveBeenCalled()
    expect(task).toHaveBeenCalledTimes(1) // no further ticks after dispose
  })

  it('dispose after a request settled, with the next timer pending → no further task or onData', async () => {
    vi.useFakeTimers()
    const { task } = mockTask(['a', 'b'], 100)
    const onData = vi.fn()
    const { scope } = start(task, onData, 1000)

    await vi.advanceTimersByTimeAsync(100) // settled; next tick pending at 1100
    expect(onData).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(task).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledTimes(1)
  })

  it('schedules the next tick only after the previous settles (no overlap)', async () => {
    vi.useFakeTimers()
    const { task } = mockTask(['a', 'b', 'c'], 500)
    const onData = vi.fn()
    const { scope } = start(task, onData, 1000)

    await vi.advanceTimersByTimeAsync(1000) // first settles at 500, next due at 1500
    expect(task).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(task).toHaveBeenCalledTimes(2)
    expect(onData).toHaveBeenNthCalledWith(1, 'a')
    scope.stop()
  })

  it('keeps polling after an error and exposes it', async () => {
    vi.useFakeTimers()
    const task = vi
      .fn<(s: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok')
    const onData = vi.fn()
    const { scope, api } = start(task, onData, 1000)
    await vi.advanceTimersByTimeAsync(0)
    expect((api.error.value as Error).message).toBe('boom')
    await vi.advanceTimersByTimeAsync(1000)
    expect(onData).toHaveBeenCalledWith('ok')
    expect(api.error.value).toBeNull()
    scope.stop()
  })

  it('a foreign AbortError (not caused by the poller) is a skipped tick: no error, schedule continues', async () => {
    vi.useFakeTimers()
    const task = vi
      .fn<(s: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce('ok')
    const onData = vi.fn()
    const { scope, api } = start(task, onData, 1000)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.error.value).toBeNull()
    expect(onData).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(2)
    expect(onData).toHaveBeenCalledWith('ok')
    scope.stop()
  })

  it('hidden → clears timer and aborts; visible → immediate refresh', async () => {
    vi.useFakeTimers()
    const { task, signals } = mockTask(['a', 'b'], 100)
    const onData = vi.fn()
    const { scope } = start(task, onData, 1000)

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(signals[0].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(task).toHaveBeenCalledTimes(1)
    expect(onData).not.toHaveBeenCalled()

    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(task).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(onData).toHaveBeenCalledWith('b')
    scope.stop()
  })
})
