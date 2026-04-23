/**
 * DotWaffle — Dot-matrix waffle chart for portfolio allocation.
 *
 * Fills a grid of dots proportionally based on each holding's
 * percentage of the portfolio. Each holding gets its own color.
 *
 * Usage:
 *   <DotWaffle
 *     holdings={[
 *       { symbol: "AAPL", pct: 35, color: "#A3AAAE" },
 *       { symbol: "VOO", pct: 28, color: "#34A853" },
 *       { symbol: "TSLA", pct: 22, color: "#536DFE" },
 *       { symbol: "MSFT", pct: 15, color: "#E91E8A" },
 *     ]}
 *     totalValue={12847.32}
 *   />
 */
import { memo, useMemo } from "react";

// Colors for holdings that don't have a specific color
const DEFAULT_COLORS = [
  "#CEDC21", // chartreuse/bull
  "#34A853", // green
  "#536DFE", // indigo
  "#E91E8A", // pink
  "#FF9100", // orange
  "#00BFA5", // teal
  "#7B61FF", // purple
  "#FF5252", // red
  "#46BDC6", // cyan
  "#FBBC04", // yellow
];

const TOTAL_DOTS = 100; // 10×10 grid
const GRID_COLS = 20;

function DotWaffle({
  holdings = [],
  totalValue,
  dotRadius = 8,
  gap = 4,
}) {
  // Assign colors and compute dot counts
  const processed = useMemo(() => {
    // Normalize percentages to sum to 100
    const totalPct = holdings.reduce((s, h) => s + (h.pct || 0), 0) || 100;
    const normalized = holdings.map((h, i) => ({
      ...h,
      color: h.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      normalPct: ((h.pct || 0) / totalPct) * 100,
    }));

    // Assign dot counts (proportional, ensure at least 1 for visible holdings)
    let remaining = TOTAL_DOTS;
    const withDots = normalized.map((h, i) => {
      if (i === normalized.length - 1) {
        return { ...h, dots: remaining };
      }
      const count = Math.max(1, Math.round((h.normalPct / 100) * TOTAL_DOTS));
      remaining -= count;
      return { ...h, dots: count };
    });

    return withDots;
  }, [holdings]);

  // Build flat array of dot colors
  const dotColors = useMemo(() => {
    const arr = [];
    for (const h of processed) {
      for (let i = 0; i < h.dots; i++) {
        arr.push(h.color);
      }
    }
    // Ensure exactly TOTAL_DOTS
    while (arr.length < TOTAL_DOTS) arr.push("var(--color-surface-light)");
    return arr.slice(0, TOTAL_DOTS);
  }, [processed]);

  const rows = Math.ceil(TOTAL_DOTS / GRID_COLS);
  const cellSize = dotRadius * 2 + gap;
  const svgW = GRID_COLS * cellSize + gap;
  const svgH = rows * cellSize + gap;

  return (
    <div className="card p-4 md:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold">Portfolio</h3>
        {totalValue != null && (
          <div className="text-right">
            <span className="text-xl font-black font-mono">
              ${Math.floor(totalValue).toLocaleString()}
            </span>
            <span className="text-sm font-mono text-muted">
              .{((totalValue % 1) * 100).toFixed(0).padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      {/* Waffle grid */}
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {dotColors.map((color, i) => {
          const col = i % GRID_COLS;
          const row = Math.floor(i / GRID_COLS);
          const cx = gap + col * cellSize + dotRadius;
          const cy = gap + row * cellSize + dotRadius;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={dotRadius}
              fill={color}
              opacity={0.85}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-3">
        {processed.map((h) => (
          <div key={h.symbol} className="flex items-center gap-1.5 text-xs">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: h.color }}
            />
            <span className="font-semibold">{h.symbol}</span>
            <span className="text-muted">{Math.round(h.normalPct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(DotWaffle);
