import axios, {
  AxiosError,
  type GenericAbortSignal,
  type InternalAxiosRequestConfig,
} from 'axios'
import { abortKey, track, untrack } from '@/api/abortManager'

declare module 'axios' {
  export interface AxiosRequestConfig {
    isDebug?: boolean
    cancelPrevious?: boolean
    abortController?: AbortController
  }
}

export const HTTP_TIMEOUT_MS = 30_000

// No baseURL: realtime hits WRA directly, rainfall goes through the same-origin /wra-rain proxy.
const instance = axios.create({ timeout: HTTP_TIMEOUT_MS })

/** Tracking / cancelPrevious key: "method path", query string stripped. */
function requestKey(config: InternalAxiosRequestConfig): string {
  const path = config.url?.split('?')[0]
  return `${config.method} ${path}`
}

/** Removes the caller-signal → own-controller forwarding listener for a request. */
const callerAbortListenerRemovers = new WeakMap<AbortController, () => void>()

/** Aborting the caller's signal aborts our controller (never the other way round). */
function forwardCallerAbort(callerSignal: GenericAbortSignal, controller: AbortController): void {
  if (callerSignal.aborted) {
    controller.abort()
  } else if (callerSignal.addEventListener) {
    const onAbort = () => controller.abort()
    callerSignal.addEventListener('abort', onAbort, { once: true } as AddEventListenerOptions)
    callerAbortListenerRemovers.set(controller, () =>
      callerSignal.removeEventListener?.('abort', onAbort),
    )
  }
}

function releaseTracking(config?: InternalAxiosRequestConfig): void {
  const controller = config?.abortController
  if (!controller) return
  untrack(controller)
  callerAbortListenerRemovers.get(controller)?.()
  callerAbortListenerRemovers.delete(controller)
}

/*
 * Deviation from the reference: the reference skips everything when the caller passes a
 * `signal`, which would drop `cancelPrevious` for polling (that always passes one). Here every
 * request gets its own tracked controller; a caller signal is forwarded into it.
 */
instance.interceptors.request.use(
  (config) => {
    const key = requestKey(config)
    if (config.cancelPrevious) abortKey(key)

    const controller = new AbortController()
    if (config.signal) forwardCallerAbort(config.signal, controller)

    config.signal = controller.signal
    config.abortController = controller
    track(controller, key)
    return config
  },
  (error: unknown) => {
    console.error(error)
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  },
)

instance.interceptors.response.use(
  (response) => {
    releaseTracking(response.config)

    if (response.status !== 200) {
      console.warn(`[API] non-200 success: ${response.status} ${response.config.url}`)
    }

    return response
  },
  async (error: AxiosError) => {
    releaseTracking(error.config)

    // Cancels are expected (cancelPrevious / caller abort): stay quiet unless debugging.
    if (axios.isCancel(error)) {
      if (error.config?.isDebug) console.warn(`[Request cancelled] ${error}`)
      return Promise.reject(error)
    }

    console.error(error)
    return Promise.reject(error)
  },
)

export default instance
