import { afterEach, describe, expect, it } from 'vitest'
import {
  ABORT_WHITELIST,
  abortAll,
  abortKey,
  getTrackingStats,
  track,
  untrack,
} from '@/api/abortManager'

afterEach(() => {
  abortAll()
  ABORT_WHITELIST.length = 0
})

describe('abortManager', () => {
  it('track counts controllers and keys', () => {
    track(new AbortController(), 'get /x')
    track(new AbortController(), 'get /x')
    track(new AbortController())
    expect(getTrackingStats()).toEqual({ controllers: 3, keys: 1 })
  })

  it('abortKey aborts that key only and forgets it', () => {
    const a = new AbortController()
    const b = new AbortController()
    track(a, 'get /x')
    track(b, 'get /y')
    abortKey('get /x')
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(false)
    expect(getTrackingStats()).toEqual({ controllers: 1, keys: 1 })
  })

  it('abortAll aborts everything and clears both collections', () => {
    const a = new AbortController()
    const b = new AbortController()
    track(a, 'get /x')
    track(b)
    abortAll()
    expect(a.signal.aborted && b.signal.aborted).toBe(true)
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })

  it('untrack forgets without aborting and removes the empty key', () => {
    const a = new AbortController()
    track(a, 'get /x')
    untrack(a)
    expect(a.signal.aborted).toBe(false)
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })

  it('untrack after abortKey is safe', () => {
    const a = new AbortController()
    track(a, 'get /x')
    abortKey('get /x')
    untrack(a)
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
  })

  it('abortKey on an unknown key does nothing', () => {
    expect(() => abortKey('get /missing')).not.toThrow()
  })

  it('whitelisted method+path is never tracked', () => {
    ABORT_WHITELIST.push({ method: 'GET', pattern: /^\/safe$/ })
    const a = new AbortController()
    track(a, 'get /safe')
    expect(getTrackingStats()).toEqual({ controllers: 0, keys: 0 })
    abortKey('get /safe')
    expect(a.signal.aborted).toBe(false)
  })
})
