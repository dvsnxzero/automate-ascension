/**
 * DotCalendar — Monthly calendar heatmap using dot-matrix cells.
 *
 * Each day cell is a 3×3 dot grid. Dot fill count represents P&L magnitude.
 * Green = profit day, red = loss day, dim = no trades.
 *
 * Usage:
 *   <DotCalendar trades={trades} month={3} year={2026} />
 */
import { memo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Build a map of date -> { pnl, count } from trades array.
 */
function buildDayMap(trades) {
  const map = {};
  for (const t of trades) {
    if (!t.closed_at) continue;
    const d = new Date(t.closed_at).toISOString().split("T")[0];
    if (!map[d]) map[d] = { pnl: 0, count: 0 };
    map[d].pnl += t.net_pnl ?? 0;
    map[d].count += 1;
  }
  return map;
}

/**
 * Map P&L magnitude to number of dots filled (1–9 in a 3×3 grid).
 * Zero = 0 filled. Max P&L in the month = 9 dots.
 */
function pnlToDots(pnl, maxAbsPnl) {
  if (pnl === 0 || maxAbsPnl === 0) return 0;
  const ratio = Math.abs(pnl) / maxAbsPnl;
  return Math.max(1, Math.ceil(ratio * 9));
}

function DotCell({ pnl, maxAbsPnl, day, size = 48 }) {
  const hasTrade = pnl !== undefined;
  const positive = pnl >= 0;
  const dotsFilled = hasTrade ? pnlToDots(pnl, maxAbsPnl) : 0;

  const gridSize = 3;
  const padding = 6;
  const gap = 3;
  const dotR = (size - padding * 2 - gap * (gridSize - 1)) / gridSize / 2;
  const actualDotR = Math.max(2, dotR);

  const bullColor = "var(--color-bull)";
  const bearColor = "var(--color-bear)";
  const emptyColor = "var(--color-surface-light)";
  const fillColor = hasTrade ? (positive ? bullColor : bearColor) : emptyColor;

  // Fill order: center out in a spiral-ish pattern for visual appeal
  const fillOrder = [4, 1, 3, 5, 7, 0, 2, 6, 8];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {day && (
        <span className="absolute top-0.5 right-1 text-[9px] text-muted/40 font-mono">
          {day}
        </span>
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: 9 }, (_, idx) => {
          const row = Math.floor(idx / gridSize);
          const col = idx % gridSize;
          const cx =
            padding + col * (actualDotR * 2 + gap) + actualDotR;
          const cy =
            padding + row * (actualDotR * 2 + gap) + actualDotR;
          const fillIdx = fillOrder.indexOf(idx);
          const isFilled = fillIdx < dotsFilled;
          return (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={actualDotR}
              fill={isFilled ? fillColor : emptyColor}
              opacity={isFilled ? (0.5 + (fillIdx / 9) * 0.5) : 0.15}
            />
          );
        })}
      </svg>
    </div>
  );
}

function DotCalendar({ trades = [], month: initMonth, year: initYear }) {
  const now = new Date();
  const [month, setMonth] = useState(initMonth ?? now.getMonth());
  const [year, setYear] = useState(initYear ?? now.getFullYear());

  const dayMap = buildDayMap(trades);

  // Get all days in this month
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Monday-based week: 0=Mon, 6=Sun
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  // Find max abs PnL for this month for scaling
  let maxAbsPnl = 0;
  let monthNet = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dayMap[key]) {
      maxAbsPnl = Math.max(maxAbsPnl, Math.abs(dayMap[key].pnl));
      monthNet += dayMap[key].pnl;
    }
  }

  // Build 6-week grid (42 cells)
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
    } else {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      cells.push({
        day: dayNum,
        pnl: dayMap[key]?.pnl,
        count: dayMap[key]?.count ?? 0,
      });
    }
  }

  const prev = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const next = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  return (
    <div className="card p-4 md:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prev} className="text-muted hover:text-theme-text transition-colors">
            <ChevronLeft size={18} />
          </button>
          <h3 className="text-lg font-bold">
            {MONTHS[month]} {year}
          </h3>
          <button onClick={next} className="text-muted hover:text-theme-text transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted mr-2">Net:</span>
          <span
            className={`text-sm font-black font-mono ${
              monthNet >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {monthNet >= 0 ? "+" : ""}${monthNet.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          </span>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] text-muted/50 font-medium uppercase"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => (
          <div key={i} className="flex justify-center">
            {cell ? (
              <DotCell
                pnl={cell.pnl}
                maxAbsPnl={maxAbsPnl}
                day={cell.day}
                size={48}
              />
            ) : (
              <div style={{ width: 48, height: 48 }} />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-bull" />
          Profit
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-bear" />
          Loss
        </div>
        <span className="text-muted/40">More dots = larger P&L</span>
      </div>
    </div>
  );
}

export default memo(DotCalendar);
