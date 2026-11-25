import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { useDocumentVisibility, useTimeoutPoll } from '@vueuse/core'
import { createLatestRequestGuard } from '@/lib/latestRequestGuard'

const isAbortError = (error: unknown) => (error as { name?: string } | null)?.name === 'AbortError'

export type Polling = {
  refresh(): Promise<void>
  lastUpdated: Ref<number | null>
  error: Ref<unknown>
}

/**
 * Polls `task` every `intervalMs`. Scheduling comes from VueUse `useTimeoutPoll` (the next
 * tick is scheduled only after the previous one settles); visibility from `useDocumentVisibility`.
 * Every tick and manual refresh goes through one latest-request guard, so an overlapping
 * refresh aborts the older request (AbortController) and its result is discarded by run id.
 * Pauses (and aborts) while the document is hidden; refetches immediately when visible again.
 * Must be called inside a component setup or an effect scope (cleans up on dispose).
 */
export function usePolling<T>(
  task: (signal: AbortSignal) => Promise<T>,
  onData: (value: T) => void,
  intervalMs: number,
): Polling {
  const lastUpdated = ref<number | null>(null)
  const error = ref<unknown>(null)
  const guard = createLatestRequestGuard<T>()
  const visibility = useDocumentVisibility()
  let disposed = false

  async function tick(): Promise<void> {
    const result = await guard.run(task)
    if (disposed || (!result.ok && result.stale)) return
    if (result.ok) {
      try {
        onData(result.value)
        lastUpdated.value = Date.now()
        error.value = null
      } catch (consumerError) {
        error.value = consumerError // keep the loop alive even if the consumer throws
      }
    } else if (!isAbortError(result.error)) {
      // A non-stale AbortError is a cancel we didn't cause (e.g. another caller's
      // cancelPrevious): treat as a skipped tick — keep the last error state, keep the schedule.
      error.value = result.error
    }
  }

  const poll = useTimeoutPoll(tick, intervalMs, { immediate: false })

  /** Fetch now, then restart the interval from this point (unless hidden or disposed). */
  async function refresh(): Promise<void> {
    if (disposed) return
    poll.pause()
    await tick()
    if (!disposed && visibility.value !== 'hidden') poll.resume()
  }

  // flush: 'sync' — abort the in-flight request the moment the tab hides, not a tick later.
  watch(
    visibility,
    (visibilityState) => {
      if (visibilityState === 'hidden') {
        poll.pause()
        guard.abort()
      } else {
        void refresh()
      }
    },
    { flush: 'sync' },
  )

  onScopeDispose(() => {
    disposed = true
    poll.pause()
    guard.abort()
  })

  if (visibility.value !== 'hidden') void refresh()

  return { refresh, lastUpdated, error }
}
