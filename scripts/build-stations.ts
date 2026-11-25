// Prebuild: fetch the WRA station table, convert TWD97 → WGS84, write public/stations.geojson.
// Runs directly with Node 22 type stripping (`node scripts/build-stations.ts`), no tsx needed.
// Uses its own axios instance on purpose: src/api/axios.ts (abortManager + cancelPrevious)
// is for UI race handling and has no meaning in a one-shot build script.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import { toFeatureCollection, type StationRow } from '#scripts/stations-lib.ts'

const STATION_URL =
  'https://opendata.wra.gov.tw/api/v2/c4acc691-7416-40ca-9464-292c0c00da92?format=JSON&page=1&size=5000'
// WRA's bot challenge triggers on short/unknown User-Agents (incl. axios' default); use a full browser UA.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../public/stations.geojson')
const REQUEST_TIMEOUT_MS = 20_000
const RETRY_DELAY_MS = 3000
/** A new file with fewer than this share of the existing features is treated as a bad fetch. */
const MIN_FEATURE_RATIO = 0.8

const client = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' },
})

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function fetchRows(): Promise<StationRow[]> {
  const response = await client.get<unknown>(STATION_URL, { responseType: 'json' })
  // The bot challenge answers 200 with an HTML page, so a 2xx alone is not enough.
  const contentType = String(response.headers['content-type'] ?? '')
  if (!contentType.includes('json')) throw new Error('WRA returned non-JSON (bot challenge?)')
  if (!Array.isArray(response.data)) throw new Error('station table is not an array')
  return response.data as StationRow[]
}

function existingCount(): number {
  try {
    return (JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')) as { features?: unknown[] }).features?.length ?? 0
  } catch {
    return 0 // missing or unreadable: nothing to protect
  }
}

/** True (and warns) when the new result is much smaller than the committed file. */
function keepExistingIfMuchSmaller(newCount: number): boolean {
  const oldCount = existingCount()
  if (oldCount === 0 || newCount >= oldCount * MIN_FEATURE_RATIO) return false
  console.warn(
    `[build-stations] new feature count ${newCount} < 80% of existing ${oldCount}; keeping existing public/stations.geojson`,
  )
  return true
}

try {
  let rows: StationRow[]
  try {
    rows = await fetchRows()
  } catch (error) {
    console.warn(`[build-stations] attempt 1 failed: ${message(error)}; retrying in 3s`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, RETRY_DELAY_MS))
    rows = await fetchRows()
  }
  const featureCollection = toFeatureCollection(rows)
  if (featureCollection.features.length === 0) throw new Error('no features produced')
  if (keepExistingIfMuchSmaller(featureCollection.features.length)) process.exit(0)
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, JSON.stringify(featureCollection))
  console.log(
    `stations.geojson: ${featureCollection.features.length} features (from ${rows.length} rows)`,
  )
} catch (error) {
  console.warn(`[build-stations] fetch failed: ${message(error)}`)
  if (existsSync(OUTPUT_PATH)) {
    console.warn('[build-stations] keeping existing public/stations.geojson')
  } else {
    console.error('[build-stations] no existing public/stations.geojson; failing')
    process.exit(1)
  }
}
