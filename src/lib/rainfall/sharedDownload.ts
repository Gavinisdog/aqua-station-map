import type { AxiosResponse } from 'axios'
import http from '@/api/axios'
import { RAINFALL_CACHE_TTL_MS, RAINFALL_PROXY_PATH } from '@/lib/config'
import {
  decodeRainfallDataset,
  parseStationRainfall,
  RainUnavailableError,
  type RainfallPoint,
} from '@/lib/rainfall/parse'

const abortError = () => new DOMException('Aborted', 'AbortError')

async function downloadDataset(signal: AbortSignal): Promise<unknown> {
  let response: AxiosResponse<ArrayBuffer>
  try {
    // No cancelPrevious: this one download is shared; only our internal signal may cancel it.
    response = await http.get<ArrayBuffer>(RAINFALL_PROXY_PATH, { signal, responseType: 'arraybuffer' })
  } catch (error) {
    // Only an abort we caused (all waiters left) is an AbortError; timeouts and any other
    // failure (HTTP, network, a cancel we did not cause) are "unavailable".
    if (signal.aborted) throw abortError()
    throw new RainUnavailableError(`Network error: ${(error as Error)?.message ?? error}`)
  }
  return decodeRainfallDataset(response.data)
}

type SharedDownload = {
  promise: Promise<unknown>
  controller: AbortController
  waiterCount: number
  /** Deferred abort scheduled when waiterCount hits 0; cancelled if someone joins in time. */
  pendingAbortTimer: ReturnType<typeof setTimeout> | null
}

let cache: { dataset: unknown; cachedAt: number } | null = null
let currentDownload: SharedDownload | null = null

/** Test-only: drop the cache and abort + forget any in-flight download. */
export function __resetRainfallCacheForTests(): void {
  if (currentDownload) cancelScheduledAbort(currentDownload)
  currentDownload?.controller.abort()
  cache = null
  currentDownload = null
}

function cancelScheduledAbort(download: SharedDownload): void {
  if (download.pendingAbortTimer) clearTimeout(download.pendingAbortTimer)
  download.pendingAbortTimer = null
}

/**
 * Abort one macrotask later, and only if nobody joined meanwhile: the latest-request guard
 * aborts the old run synchronously just before the new run calls in, so an immediate abort
 * would restart the 1MB download.
 */
function scheduleAbortIfNoWaiters(download: SharedDownload): void {
  if (download.waiterCount !== 0 || download.pendingAbortTimer) return
  download.pendingAbortTimer = setTimeout(() => {
    download.pendingAbortTimer = null
    if (download.waiterCount !== 0) return
    if (currentDownload === download) currentDownload = null
    download.controller.abort()
  }, 0)
}

function startSharedDownload(): SharedDownload {
  const controller = new AbortController()
  const download: SharedDownload = {
    controller,
    waiterCount: 0,
    pendingAbortTimer: null,
    promise: Promise.resolve(),
  }
  const forget = () => {
    cancelScheduledAbort(download)
    if (currentDownload === download) currentDownload = null
  }
  download.promise = downloadDataset(controller.signal).then(
    (dataset) => {
      // A fully-aborted download never populates the cache, even if the transport ignored the abort.
      if (!controller.signal.aborted) cache = { dataset, cachedAt: Date.now() }
      forget()
      return dataset
    },
    (error) => {
      forget()
      throw error
    },
  )
  // Every waiter may have detached; keep the shared rejection from going unhandled.
  download.promise.catch(() => {})
  return download
}

/**
 * Hourly rainfall for one station. The whole dataset (~1MB) is downloaded once, shared by
 * concurrent callers, and cached for RAINFALL_CACHE_TTL_MS. The caller's signal only detaches
 * that caller (rejects AbortError); the download itself aborts only when every waiter has
 * left and nobody re-joins within one macrotask (see scheduleAbortIfNoWaiters).
 * Resolves null when the station has no series; rejects RainUnavailableError on failure.
 */
export function fetchStationRainfall(
  stationId: string,
  signal: AbortSignal,
): Promise<RainfallPoint[] | null> {
  if (signal.aborted) return Promise.reject(abortError())
  if (cache && Date.now() - cache.cachedAt < RAINFALL_CACHE_TTL_MS) {
    return Promise.resolve(parseStationRainfall(cache.dataset, stationId))
  }
  if (!currentDownload) currentDownload = startSharedDownload()
  const download = currentDownload
  cancelScheduledAbort(download)
  download.waiterCount++

  return new Promise((resolve, reject) => {
    let settled = false
    const detachWaiter = () => {
      settled = true
      download.waiterCount--
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      if (settled) return
      detachWaiter()
      scheduleAbortIfNoWaiters(download)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort)
    download.promise.then(
      (dataset) => {
        if (settled) return
        detachWaiter()
        resolve(parseStationRainfall(dataset, stationId))
      },
      (error) => {
        if (settled) return
        detachWaiter()
        reject(error)
      },
    )
  })
}
