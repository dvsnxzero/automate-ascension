/**
 * DotLogo — Dot-matrix circle logo for stock tickers.
 *
 * Renders curated hand-mapped logos for well-known companies
 * and falls back to a deterministic hash-based generative pattern
 * for any other ticker.
 *
 * Usage:
 *   <DotLogo ticker="AAPL" size={40} />
 *   <DotLogo ticker="VOO" size={32} />
 */
import { memo } from "react";

// ── Curated logo data ──────────────────────────────────────────
// Each logo is an 11×11 grid. 1 = filled dot, 0 = empty.
// Accent color is picked to loosely match the brand.

const CURATED = {
  AAPL: {
    color: "#A3AAAE",
    grid: [
      [0,0,0,0,0,0,1,0,0,0,0],
      [0,0,0,0,0,1,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,0,0,0],
      [0,0,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0,0,1,0],
      [0,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,0,0,1,0],
      [0,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,1,1,1,0,0],
      [0,0,0,1,1,0,1,1,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
    ],
  },
  TSLA: {
    color: "#E31937",
    grid: [
      [0,0,0,1,1,1,1,1,0,0,0],
      [0,1,1,1,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,1,0,0,0,1,0,0,0,1,1],
      [0,0,0,0,0,1,0,0,0,0,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,0,1,0,0,0,0,0],
      [0,0,0,0,0,1,0,0,0,0,0],
      [0,0,0,0,0,1,0,0,0,0,0],
      [0,0,0,0,0,1,0,0,0,0,0],
    ],
  },
  GOOGL: {
    color: "#4285F4",
    grid: [
      [0,0,0,1,1,1,1,1,0,0,0],
      [0,0,1,1,0,0,0,1,1,0,0],
      [0,1,1,0,0,0,0,0,1,1,0],
      [1,1,0,0,0,0,0,0,0,0,0],
      [1,1,0,0,0,0,0,0,0,0,0],
      [1,1,0,0,0,1,1,1,1,0,0],
      [1,1,0,0,0,0,0,0,1,1,0],
      [0,1,1,0,0,0,0,0,1,1,0],
      [0,0,1,1,0,0,0,1,1,0,0],
      [0,0,0,1,1,1,1,1,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
    ],
  },
  GOOG: {
    color: "#4285F4",
    grid: [
      [0,0,0,1,1,1,1,1,0,0,0],
      [0,0,1,1,0,0,0,1,1,0,0],
      [0,1,1,0,0,0,0,0,1,1,0],
      [1,1,0,0,0,0,0,0,0,0,0],
      [1,1,0,0,0,0,0,0,0,0,0],
      [1,1,0,0,0,1,1,1,1,0,0],
      [1,1,0,0,0,0,0,0,1,1,0],
      [0,1,1,0,0,0,0,0,1,1,0],
      [0,0,1,1,0,0,0,1,1,0,0],
      [0,0,0,1,1,1,1,1,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
    ],
  },
  AMZN: {
    color: "#FF9900",
    grid: [
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
      [1,0,0,0,0,0,0,0,0,0,0],
      [0,1,0,0,0,0,0,0,0,0,1],
      [0,0,1,0,0,0,0,0,0,1,0],
      [0,0,0,1,0,0,0,0,1,0,0],
      [0,0,0,0,1,0,0,1,0,0,0],
      [0,0,0,0,0,1,1,0,0,0,1],
      [0,0,0,0,0,0,0,0,0,1,0],
    ],
  },
  MSFT: {
    color: "#00A4EF",
    grid: [
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,1,1,1,1,0,1,1,1,1,1],
      [0,0,0,0,0,0,0,0,0,0,0],
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,1,1,1,1,0,1,1,1,1,1],
    ],
  },
  META: {
    color: "#0081FB",
    grid: [
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,0,1,1,0,0,0,1,1,0,0],
      [0,1,0,0,1,0,1,0,0,1,0],
      [1,1,0,0,0,1,0,0,0,1,1],
      [1,0,0,0,1,0,1,0,0,0,1],
      [1,0,0,1,0,0,0,1,0,0,1],
      [1,0,0,0,1,0,1,0,0,0,1],
      [1,1,0,0,0,1,0,0,0,1,1],
      [0,1,0,0,1,0,1,0,0,1,0],
      [0,0,1,1,0,0,0,1,1,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
    ],
  },
  NVDA: {
    color: "#76B900",
    grid: [
      [0,0,0,0,0,1,1,1,1,0,0],
      [0,0,0,0,1,1,0,0,1,1,0],
      [0,0,0,1,1,0,0,0,0,1,1],
      [0,0,1,1,0,0,1,0,0,1,1],
      [0,1,1,0,0,1,0,0,0,1,1],
      [1,1,0,0,1,0,0,0,0,1,1],
      [0,1,1,0,0,0,0,0,0,1,1],
      [0,0,1,1,0,0,0,0,0,1,1],
      [0,0,0,1,1,0,0,0,0,1,1],
      [0,0,0,0,1,1,0,0,1,1,0],
      [0,0,0,0,0,1,1,1,1,0,0],
    ],
  },
  NFLX: {
    color: "#E50914",
    grid: [
      [1,1,0,0,0,0,0,0,0,1,1],
      [1,1,1,0,0,0,0,0,0,1,1],
      [1,1,1,1,0,0,0,0,0,1,1],
      [1,1,0,1,1,0,0,0,0,1,1],
      [1,1,0,0,1,1,0,0,0,1,1],
      [1,1,0,0,0,1,1,0,0,1,1],
      [1,1,0,0,0,0,1,1,0,1,1],
      [1,1,0,0,0,0,0,1,1,1,1],
      [1,1,0,0,0,0,0,0,1,1,1],
      [1,1,0,0,0,0,0,0,0,1,1],
      [1,1,0,0,0,0,0,0,0,1,1],
    ],
  },
  SPY: {
    color: "#1B365D",
    grid: [
      [0,0,1,1,1,1,1,1,0,0,0],
      [0,1,1,1,0,0,0,1,1,0,0],
      [0,1,1,0,0,0,0,0,1,1,0],
      [0,1,1,0,0,0,0,0,0,0,0],
      [0,0,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,0,0],
      [0,0,0,0,0,0,0,0,1,1,0],
      [0,1,1,0,0,0,0,0,1,1,0],
      [0,0,1,1,0,0,0,1,1,1,0],
      [0,0,0,1,1,1,1,1,1,0,0],
    ],
  },
};


// ── Grid cache ────────────────────────────────────────────────
// Generative grids are deterministic but involve multiple hash
// passes. Cache the result so repeat renders (watchlists, search
// dropdowns, re-renders) skip the computation entirely.
const _gridCache = new Map();

function getCachedGrid(ticker) {
  if (_gridCache.has(ticker)) return _gridCache.get(ticker);
  const entry = {
    grid: generateGrid(ticker),
    color: getGenerativeColor(ticker),
  };
  _gridCache.set(ticker, entry);
  // Cap cache at 500 tickers to avoid unbounded growth
  if (_gridCache.size > 500) {
    const oldest = _gridCache.keys().next().value;
    _gridCache.delete(oldest);
  }
  return entry;
}


// ── Generative hash-based logo ────────────────────────────────
// Deterministic: same ticker always produces the same pattern.

const PALETTE = [
  "#4285F4", "#EA4335", "#FBBC04", "#34A853", "#FF6D01",
  "#46BDC6", "#7B61FF", "#E91E8A", "#00BFA5", "#FF5252",
  "#536DFE", "#FF9100", "#00E5FF", "#C6FF00", "#D500F9",
];

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function generateGrid(ticker, gridSize = 9) {
  const h = hashStr(ticker);
  const half = Math.ceil(gridSize / 2);
  const grid = [];

  for (let row = 0; row < gridSize; row++) {
    const line = [];
    for (let col = 0; col < half; col++) {
      // Use different bit combos for each cell
      const bit = (h >> ((row * half + col) % 31)) & 1;
      // Mix in a second hash pass for more variety
      const bit2 = (hashStr(ticker + row + col) >> (col % 15)) & 1;
      line.push(bit | bit2 ? 1 : 0);
    }
    // Mirror to make symmetric
    const fullLine = [...line];
    for (let col = half - 1 - (gridSize % 2 === 0 ? 0 : 1); col >= 0; col--) {
      fullLine.push(line[col]);
    }
    grid.push(fullLine);
  }

  // Ensure at least ~30% filled for visual weight
  let filled = 0;
  const total = gridSize * gridSize;
  for (const row of grid) for (const c of row) filled += c;
  if (filled / total < 0.3) {
    // Fill center cross
    const mid = Math.floor(gridSize / 2);
    for (let i = 0; i < gridSize; i++) {
      grid[mid][i] = 1;
      grid[i][mid] = 1;
    }
  }

  return grid;
}

function getGenerativeColor(ticker) {
  return PALETTE[hashStr(ticker) % PALETTE.length];
}


// ── React component ───────────────────────────────────────────

function DotLogo({ ticker, size = 40, className = "" }) {
  if (!ticker) return null;

  const upper = ticker.toUpperCase();
  const curated = CURATED[upper];

  // Use curated data or fall back to cached generative grid
  const cached = curated ? null : getCachedGrid(upper);
  const grid = curated ? curated.grid : cached.grid;
  const color = curated ? curated.color : cached.color;
  const gridSize = grid.length;

  // Calculate dot sizing
  const gap = Math.max(1, Math.round(size * 0.04));
  const dotSize = (size - gap * (gridSize + 1)) / gridSize;
  const actualDot = Math.max(1.5, dotSize);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`${upper} logo`}
    >
      {/* Subtle bg circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2}
        fill={color}
        opacity={0.08}
      />
      {grid.map((row, ri) =>
        row.map((cell, ci) => {
          if (!cell) return null;
          const cx = gap + ci * (actualDot + gap) + actualDot / 2;
          const cy = gap + ri * (actualDot + gap) + actualDot / 2;
          return (
            <circle
              key={`${ri}-${ci}`}
              cx={cx}
              cy={cy}
              r={actualDot / 2}
              fill={color}
            />
          );
        })
      )}
    </svg>
  );
}

export default memo(DotLogo);
