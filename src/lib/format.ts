const taiwanDateTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Epoch ms → "MM/DD HH:mm" in Taiwan time. */
export function formatTime(epochMs: number | null | undefined): string {
  return epochMs === null || epochMs === undefined || !Number.isFinite(epochMs)
    ? '—'
    : taiwanDateTimeFormat.format(epochMs)
}

export function formatLevel(meters: number | null | undefined): string {
  return meters === null || meters === undefined ? '—' : `${meters.toFixed(2)} m`
}
