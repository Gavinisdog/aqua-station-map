/**
 * off: feature disabled; none: station absent from the rainfall dataset;
 * unavailable: /wra-rain failed (water level still shown).
 */
export type RainfallLoadState = 'off' | 'loading' | 'ok' | 'unavailable' | 'none'

export const RAINFALL_STATE_CAPTION: Partial<Record<RainfallLoadState, string>> = {
  loading: '雨量資料載入中…',
  unavailable: '雨量資料暫不可用',
  none: '此站無上游雨量資料',
}
