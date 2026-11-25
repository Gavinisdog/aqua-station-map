export type GuardedResult<T> =
  | { ok: true; value: T }
  | { ok: false; stale: true }
  | { ok: false; stale: false; error: unknown }

export type LatestRequestGuard<T> = {
  run(task: (signal: AbortSignal) => Promise<T>): Promise<GuardedResult<T>>
  abort(): void
}

/**
 * Latest-request guard: each run aborts the previous one (AbortController) AND bumps a
 * run id, so a superseded result is discarded even if the task ignored its signal.
 * run() never rejects.
 */
export function createLatestRequestGuard<T>(): LatestRequestGuard<T> {
  let latestRunId = 0
  let activeController: AbortController | null = null

  return {
    async run(task) {
      activeController?.abort()
      const runId = ++latestRunId
      const controller = new AbortController()
      activeController = controller
      // The run id alone decides staleness: run() and abort() both bump it, so this holds
      // even when the task ignored its signal.
      const isCurrent = () => runId === latestRunId
      try {
        const value = await task(controller.signal)
        return isCurrent() ? { ok: true, value } : { ok: false, stale: true }
      } catch (error) {
        return isCurrent() ? { ok: false, stale: false, error } : { ok: false, stale: true }
      } finally {
        if (activeController === controller) activeController = null
      }
    },
    abort() {
      latestRunId++
      activeController?.abort()
      activeController = null
    },
  }
}
