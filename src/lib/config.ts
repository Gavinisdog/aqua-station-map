export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS

export const WRA_API_BASE = 'https://opendata.wra.gov.tw/api/v2/'
export const REALTIME_DATASET_ID = '73c4c3de-4045-4765-abeb-89f9f9cd5ff0'
export const REALTIME_WATER_LEVEL_URL = `${WRA_API_BASE}${REALTIME_DATASET_ID}?format=JSON&page=1&size=5000`

/** Same-origin proxy to the WRA rainfall dataset (vite dev proxy, Vercel/Netlify rewrite). */
export const RAINFALL_PROXY_PATH = '/wra-rain'
export const IS_RAINFALL_ENABLED: boolean = import.meta.env.VITE_FEATURE_RAIN !== 'false'

export const POLL_INTERVAL_MS = 10 * MINUTE_MS
export const STALE_AFTER_MS = 3 * HOUR_MS
export const RAINFALL_CACHE_TTL_MS = 5 * MINUTE_MS
