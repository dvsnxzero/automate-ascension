/**
 * PageLoader — branded loading state matching the AutomateAscension look.
 *
 * Three sizes:
 *   - "fullscreen" → centered on the entire viewport (used for app boot)
 *   - "page"       → centered in the page content area (used for tab loads)
 *   - "inline"     → small, fits inside cards / panels
 *
 * Always shows: lightning-bolt logo with a soft pulse ring + the
 * AutomateAscension wordmark + a status line + a 3-dot bouncing pulse.
 */

export default function PageLoader({
  variant = "page",
  message = "Loading...",
  className = "",
}) {
  const isFull = variant === "fullscreen";
  const isInline = variant === "inline";

  if (isInline) {
    return (
      <div className={`flex items-center justify-center gap-3 py-8 ${className}`}>
        <div className="relative shrink-0">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 26 26" fill="none">
              <path d="M15 3L6 15H13L11 23L20 11H13L15 3Z" fill="#000" />
            </svg>
          </div>
          <div className="absolute inset-0 rounded-lg bg-accent/30 animate-ping" />
        </div>
        <div className="text-xs text-muted font-medium">
          {message}
          <DotPulse />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        isFull ? "min-h-screen" : "min-h-[60vh]"
      } w-full flex flex-col items-center justify-center gap-5 px-6 ${className}`}
    >
      {/* Logo with pulse ring */}
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 26 26" fill="none">
            <path d="M15 3L6 15H13L11 23L20 11H13L15 3Z" fill="#000" />
          </svg>
        </div>
        <div className="absolute inset-0 rounded-2xl bg-accent/20 animate-ping" />
        <div className="absolute -inset-2 rounded-3xl border border-accent/20 animate-pulse" />
      </div>

      {/* Wordmark */}
      <div className="text-center">
        <div className="text-lg font-bold tracking-tight">
          <span className="text-theme-text">Automate</span>
          <span className="text-accent">Ascension</span>
        </div>
        <div className="text-[11px] text-muted mt-1.5 font-mono uppercase tracking-[0.2em] flex items-center justify-center gap-1">
          {message}
          <DotPulse />
        </div>
      </div>
    </div>
  );
}

/* ── 3-dot bouncing pulse, accent-colored ── */
function DotPulse() {
  return (
    <span className="inline-flex gap-0.5 ml-0.5 align-middle">
      <span className="w-1 h-1 rounded-full bg-accent animate-pulse [animation-delay:0ms]" />
      <span className="w-1 h-1 rounded-full bg-accent animate-pulse [animation-delay:150ms]" />
      <span className="w-1 h-1 rounded-full bg-accent animate-pulse [animation-delay:300ms]" />
    </span>
  );
}
