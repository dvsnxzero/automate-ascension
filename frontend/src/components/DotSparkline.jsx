/**
 * DotSparkline — Dot-trail sparkline for watchlist/position cards.
 *
 * Renders price history as a trail of dots that follow the price curve.
 * Green dots = upward movement, red dots = downward movement.
 * Dot opacity increases toward the most recent data point.
 *
 * Usage:
 *   <DotSparkline data={[100, 102, 99, 105]} positive={true} width={120} height={40} />
 *   <DotSparkline data={priceArray} width={200} height={60} />
 */
import { memo } from "react";

function DotSparkline({
  data = [],
  positive,
  width = 120,
  height = 40,
  dotCount = 20,
  dotRadius = 2.5,
}) {
  // Generate demo data if none provided
  let pts = data;
  if (pts.length < 2) {
    let p = 100;
    pts = Array.from({ length: dotCount }, () => {
      p += (Math.random() - 0.48) * 3;
      return p;
    });
  }

  // Downsample or use as-is
  let sampled = pts;
  if (pts.length > dotCount) {
    const step = (pts.length - 1) / (dotCount - 1);
    sampled = Array.from({ length: dotCount }, (_, i) =>
      pts[Math.round(i * step)]
    );
  }

  // Auto-detect direction if not provided
  const autoPositive =
    positive !== undefined
      ? positive
      : sampled[sampled.length - 1] >= sampled[0];

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;

  const padX = dotRadius + 1;
  const padY = dotRadius + 1;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const dots = sampled.map((val, i) => {
    const x = padX + (i / (sampled.length - 1)) * innerW;
    const y = padY + (1 - (val - min) / range) * innerH;
    // Opacity ramps from 0.2 → 1.0 (most recent = brightest)
    const opacity = 0.2 + (i / (sampled.length - 1)) * 0.8;
    // Per-dot color: compare to previous point
    const localUp = i === 0 ? autoPositive : val >= sampled[i - 1];
    return { x, y, opacity, up: localUp };
  });

  const bullColor = "var(--color-bull)";
  const bearColor = "var(--color-bear)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={dotRadius}
          fill={d.up ? bullColor : bearColor}
          opacity={d.opacity}
        />
      ))}
    </svg>
  );
}

export default memo(DotSparkline);
