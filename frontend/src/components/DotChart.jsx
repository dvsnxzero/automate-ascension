/**
 * DotChart — Dot-matrix price chart.
 *
 * Each column = 1 time period. Dots fill a vertical grid range
 * representing the OHLC bar. Green = close > open, red = close < open.
 * Empty dots show the full price range background.
 *
 * Usage:
 *   <DotChart bars={bars} width={800} height={300} />
 */
import { memo, useMemo, useRef, useState, useEffect } from "react";
import DotLogo from "./DotLogo";

const GRID_ROWS = 30; // vertical resolution

function DotChart({
  bars = [],
  symbol = "",
  width: propWidth,
  height: propHeight = 300,
  dotRadius = 3.5,
  gap = 1.5,
}) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(propWidth || 800);
  const [hoveredCol, setHoveredCol] = useState(null);

  // Responsive width
  useEffect(() => {
    if (propWidth) return;
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) setContainerWidth(entries[0].contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [propWidth]);

  const width = propWidth || containerWidth;
  const height = propHeight;

  // Compute grid data
  const gridData = useMemo(() => {
    if (bars.length === 0) return { grid: [], priceMin: 0, priceMax: 0 };

    // Find global price range
    let priceMin = Infinity, priceMax = -Infinity;
    for (const b of bars) {
      if (b.low < priceMin) priceMin = b.low;
      if (b.high > priceMax) priceMax = b.high;
    }
    // Add small padding
    const pRange = priceMax - priceMin || 1;
    priceMin -= pRange * 0.02;
    priceMax += pRange * 0.02;
    const totalRange = priceMax - priceMin;

    // Map each bar to filled row indices
    const grid = bars.map((b) => {
      const openRow = Math.round(((b.open - priceMin) / totalRange) * (GRID_ROWS - 1));
      const closeRow = Math.round(((b.close - priceMin) / totalRange) * (GRID_ROWS - 1));
      const highRow = Math.round(((b.high - priceMin) / totalRange) * (GRID_ROWS - 1));
      const lowRow = Math.round(((b.low - priceMin) / totalRange) * (GRID_ROWS - 1));
      const bullish = b.close >= b.open;
      const bodyTop = Math.max(openRow, closeRow);
      const bodyBot = Math.min(openRow, closeRow);
      return {
        bar: b,
        bullish,
        highRow,
        lowRow,
        bodyTop,
        bodyBot,
      };
    });

    return { grid, priceMin, priceMax };
  }, [bars]);

  const { grid, priceMin, priceMax } = gridData;

  if (grid.length === 0) {
    return (
      <div ref={containerRef} className="card p-8 text-center text-muted text-sm">
        No data for dot chart
      </div>
    );
  }

  // Calculate dot sizing based on available space
  const cols = grid.length;
  const dotDiameter = dotRadius * 2;
  const cellW = dotDiameter + gap;
  const cellH = dotDiameter + gap;
  const padLeft = 60; // price labels
  const padRight = 10;
  const padTop = 10;
  const padBottom = 24; // time labels

  // If too many bars, take the most recent that fit
  const maxCols = Math.floor((width - padLeft - padRight) / cellW);
  const displayBars = cols > maxCols ? grid.slice(-maxCols) : grid;
  const svgW = padLeft + displayBars.length * cellW + padRight;
  const svgH = padTop + GRID_ROWS * cellH + padBottom;

  const bullColor = "var(--color-bull)";
  const bearColor = "var(--color-bear)";

  // Price labels (5 evenly spaced)
  const priceLabels = Array.from({ length: 5 }, (_, i) => {
    const ratio = i / 4;
    const price = priceMin + (priceMax - priceMin) * ratio;
    const y = padTop + (GRID_ROWS - 1 - ratio * (GRID_ROWS - 1)) * cellH + dotRadius;
    return { price, y };
  });

  // Hovered bar info
  const hoveredBar = hoveredCol !== null ? displayBars[hoveredCol]?.bar : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Tooltip */}
      {hoveredBar && (
        <div className="absolute top-2 right-2 bg-surface border border-border rounded-xl px-3 py-2 text-xs font-mono z-10 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            {symbol && <DotLogo ticker={symbol} size={18} />}
            <span className="font-bold">{symbol}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted">
            <span>O</span><span className="text-theme-text">{hoveredBar.open?.toFixed(2)}</span>
            <span>H</span><span className="text-theme-text">{hoveredBar.high?.toFixed(2)}</span>
            <span>L</span><span className="text-theme-text">{hoveredBar.low?.toFixed(2)}</span>
            <span>C</span><span className="text-theme-text">{hoveredBar.close?.toFixed(2)}</span>
          </div>
        </div>
      )}

      <svg
        width="100%"
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        preserveAspectRatio="xMidYMid meet"
        className="select-none"
      >
        {/* Price labels */}
        {priceLabels.map((pl, i) => (
          <text
            key={i}
            x={padLeft - 8}
            y={pl.y + 3}
            textAnchor="end"
            className="fill-muted"
            fontSize="9"
            fontFamily="'Space Mono', monospace"
          >
            {pl.price.toFixed(pl.price >= 100 ? 0 : 2)}
          </text>
        ))}

        {/* Dot grid */}
        {displayBars.map((col, ci) => {
          const x = padLeft + ci * cellW + dotRadius;
          const isHovered = hoveredCol === ci;
          return (
            <g
              key={ci}
              onMouseEnter={() => setHoveredCol(ci)}
              onMouseLeave={() => setHoveredCol(null)}
              style={{ cursor: "crosshair" }}
            >
              {/* Invisible hit area */}
              <rect
                x={x - dotRadius - gap / 2}
                y={padTop}
                width={cellW}
                height={GRID_ROWS * cellH}
                fill="transparent"
              />
              {Array.from({ length: GRID_ROWS }, (_, ri) => {
                // ri=0 is highest price, ri=GRID_ROWS-1 is lowest
                const rowIdx = GRID_ROWS - 1 - ri;
                const cy = padTop + ri * cellH + dotRadius;

                const inWick =
                  rowIdx >= col.lowRow && rowIdx <= col.highRow;
                const inBody =
                  rowIdx >= col.bodyBot && rowIdx <= col.bodyTop;

                let fill;
                let opacity;

                if (inBody) {
                  fill = col.bullish ? bullColor : bearColor;
                  opacity = isHovered ? 1 : 0.85;
                } else if (inWick) {
                  fill = col.bullish ? bullColor : bearColor;
                  opacity = isHovered ? 0.5 : 0.3;
                } else {
                  fill = "var(--color-surface-light)";
                  opacity = isHovered ? 0.12 : 0.06;
                }

                return (
                  <circle
                    key={ri}
                    cx={x}
                    cy={cy}
                    r={dotRadius}
                    fill={fill}
                    opacity={opacity}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-1 text-[10px] text-muted">
        <span>Each column = 1 {bars[0]?.time?.toString().includes("-") ? "day" : "period"}</span>
        <span>·</span>
        <span>Filled dots = price range</span>
        <span>·</span>
        <div className="flex items-center gap-1">
          <span className="text-bull font-semibold">Green</span> = close {">"} open
        </div>
        <span>·</span>
        <div className="flex items-center gap-1">
          <span className="text-bear font-semibold">Red</span> = close {"<"} open
        </div>
      </div>
    </div>
  );
}

export default memo(DotChart);
