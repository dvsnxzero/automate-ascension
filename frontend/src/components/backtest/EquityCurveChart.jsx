/**
 * EquityCurveChart — lightweight-charts line chart for the run's equity curve.
 *
 * Reads CSS theme variables so accent / text / grid colors stay in sync with
 * the AutomateAscension light + dark themes — no per-component color picks.
 */
import { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle } from "lightweight-charts";
import { useTheme } from "../../hooks/useTheme";

function readVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function EquityCurveChart({ curve = [], startingCapital = 0, height = 280 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const baselineRef = useRef(null);
  const { isDark } = useTheme();

  // Build chart once (and rebuild on theme flip so colors track the new vars)
  useEffect(() => {
    if (!containerRef.current) return;
    const accent = readVar("--color-accent") || "#6B8A00";
    const muted = readVar("--color-muted") || "#777";
    const border = readVar("--color-border") || "#D4D4D4";
    const text = readVar("--color-text") || "#111";

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontFamily: "Space Grotesk, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: border, style: LineStyle.Dotted },
        horzLines: { color: border, style: LineStyle.Dotted },
      },
      timeScale: { borderColor: border, timeVisible: false },
      rightPriceScale: { borderColor: border },
      crosshair: { mode: 1 },
      width: containerRef.current.clientWidth,
      height,
    });

    const series = chart.addLineSeries({
      color: accent,
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    seriesRef.current = series;

    const baseline = chart.addLineSeries({
      color: muted,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    baselineRef.current = baseline;

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      baselineRef.current = null;
    };
  }, [isDark, height]);

  // Push data whenever curve / starting capital changes
  useEffect(() => {
    if (!seriesRef.current || !curve?.length) return;
    const points = curve.map((p) => ({ time: p.time, value: p.value }));
    seriesRef.current.setData(points);

    if (baselineRef.current && startingCapital) {
      baselineRef.current.setData(points.map((p) => ({ time: p.time, value: startingCapital })));
    }
    chartRef.current?.timeScale().fitContent();
  }, [curve, startingCapital]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
