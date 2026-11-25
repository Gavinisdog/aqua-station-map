import { ALERT_LEVELS } from "@/lib/alertStatus";
import { HOUR_MS } from "@/lib/config";
import type { WaterLevelReading } from "@/lib/realtime";
import type { AlertThresholds } from "@/types/station";
import type { EChartsCoreOption } from "echarts/core";

export const CHART_WINDOW_MS = 25 * HOUR_MS;
export const WATER_LEVEL_COLOR = "#2166ac";

export type AxisRange = { min: number; max: number };

const roundToCm = (meters: number) => Math.round(meters * 100) / 100;

function activeAlertLines(thresholds: AlertThresholds) {
  return ALERT_LEVELS.flatMap((level) => {
    const value = thresholds[level.key];
    return value === null
      ? []
      : [{ label: level.label, color: level.lineColor, value }];
  });
}

/**
 * Y range (m) over the water levels and the alert lines: markLine values do not widen the
 * axis by themselves. Padded by 10% (at least 0.2 m), rounded to cm.
 */
export function waterLevelAxisRange(
  levels: WaterLevelReading[],
  thresholds: AlertThresholds,
): AxisRange {
  const values = [
    ...levels.flatMap((reading) =>
      reading.waterLevelM === null ? [] : [reading.waterLevelM],
    ),
    ...activeAlertLines(thresholds).map((line) => line.value),
  ];
  const minLevel = values.length ? Math.min(...values) : 0;
  const maxLevel = values.length ? Math.max(...values) : 1;
  const axisPadding = Math.max((maxLevel - minLevel) * 0.1, 0.2);
  return {
    min: roundToCm(minLevel - axisPadding),
    max: roundToCm(maxLevel + axisPadding),
  };
}

/**
 * Explicit x range (ms): with few points ECharts pads the time axis by ±1 day, running into
 * tomorrow. min = min(now − 25 h, earliest point); max = max(now, latest point).
 */
export function timeAxisRange(
  levels: WaterLevelReading[],
  now: number,
): AxisRange {
  let min = now - CHART_WINDOW_MS;
  let max = now;
  for (const { observedAt: time } of levels) {
    if (time < min) min = time;
    if (time > max) max = time;
  }
  return { min, max };
}

export type StationChartInput = {
  thresholds: AlertThresholds;
  history: WaterLevelReading[];
  now: number;
};

export function buildStationChartOption({
  thresholds,
  history,
  now,
}: StationChartInput): EChartsCoreOption {
  const levels = history.filter((reading) => reading.waterLevelM !== null);
  const levelRange = waterLevelAxisRange(levels, thresholds);

  const series: EChartsCoreOption[] = [
    {
      name: "水位",
      type: "line",
      yAxisIndex: 0,
      showSymbol: levels.length < 30,
      symbolSize: 5,
      lineStyle: { width: 2, color: WATER_LEVEL_COLOR },
      itemStyle: { color: WATER_LEVEL_COLOR },
      data: levels.map((reading) => [reading.observedAt, reading.waterLevelM]),
      markLine: {
        silent: true,
        symbol: "none",
        data: activeAlertLines(thresholds).map((line) => ({
          name: line.label,
          yAxis: line.value,
          lineStyle: { color: line.color, type: "dashed", width: 1.5 },
          label: {
            formatter: `${line.label} ${line.value} m`,
            color: line.color,
            position: "insideEndTop",
          },
        })),
      },
    },
  ];

  return {
    animation: false,
    grid: { left: 52, right: 16, top: 32, bottom: 56 },
    legend: { top: 0, data: series.map((entry) => entry.name as string) },
    tooltip: { trigger: "axis" },
    // Ctrl+wheel only and no drag-pan, so wheel/touch still scroll the bottom sheet.
    dataZoom: [
      {
        type: "inside",
        zoomOnMouseWheel: "ctrl",
        moveOnMouseWheel: false,
        moveOnMouseMove: false,
      },
      { type: "slider", height: 16, bottom: 8 },
    ],
    xAxis: { type: "time", ...timeAxisRange(levels, now) },
    yAxis: {
      type: "value",
      name: "m",
      ...levelRange,
      axisLabel: { formatter: (value: number) => value.toFixed(1) },
    },
    series,
  };
}
