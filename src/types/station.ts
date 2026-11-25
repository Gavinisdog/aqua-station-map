// Shared by the app (src/) and the build script (scripts/). Keep it dependency-free
// (type-only imports from packages) so Node can type-strip and run it directly.
import type { Feature, FeatureCollection, Point } from 'geojson'

/** Water-level alert thresholds in metres; field names match public/stations.geojson. */
export type AlertThresholds = { alert1: number | null; alert2: number | null; alert3: number | null }

/** Properties of each feature in public/stations.geojson. */
export type StationProps = AlertThresholds & { id: string; name: string; river: string }
export type StationFeature = Feature<Point, StationProps>
export type StationCollection = FeatureCollection<Point, StationProps>
