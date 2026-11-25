export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS

export const WRA_API_BASE = 'https://opendata.wra.gov.tw/api/v2/'
export const REALTIME_DATASET_ID = '73c4c3de-4045-4765-abeb-89f9f9cd5ff0'
export const REALTIME_WATER_LEVEL_URL = `${WRA_API_BASE}${REALTIME_DATASET_ID}?format=JSON&page=1&size=5000`

export const POLL_INTERVAL_MS = 10 * MINUTE_MS
export const STALE_AFTER_MS = 3 * HOUR_MS
