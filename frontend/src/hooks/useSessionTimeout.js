import { useEffect, useRef, useCallback } from "react";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity
const BLUR_TIMEOUT_MS = 20 * 1000; // 20 seconds when window is blurred / tab hidden
const STORAGE_KEY = "aa-timeout-mins";
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

/**
 * Session timeout hook.
 * Logs the user out after:
 *   1. inactivity for `timeoutMs` (default 30 min, configurable in Settings)
 *   2. window blurred / tab hidden for >20s
 *
 * @param {Function} onTimeout - called when timeout fires (e.g., logout)
 * @param {number} [timeoutMs] - override the inactivity timeout in ms
 */
export function useSessionTimeout(onTimeout, timeoutMs) {
  const timerRef = useRef(null);
  const blurTimerRef = useRef(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const getTimeout = useCallback(() => {
    if (timeoutMs) return timeoutMs;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return parseInt(stored, 10) * 60 * 1000;
    } catch {}
    return DEFAULT_TIMEOUT_MS;
  }, [timeoutMs]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onTimeoutRef.current?.();
    }, getTimeout());
  }, [getTimeout]);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const startBlurTimer = useCallback(() => {
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      onTimeoutRef.current?.();
    }, BLUR_TIMEOUT_MS);
  }, [clearBlurTimer]);

  useEffect(() => {
    // Start inactivity timer
    resetTimer();

    // Reset inactivity timer on any user input
    const activityHandler = () => resetTimer();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, activityHandler, { passive: true }));

    // Blur / visibility handlers — sign out after 20s away
    const handleVisibility = () => {
      if (document.hidden) startBlurTimer();
      else { clearBlurTimer(); resetTimer(); }
    };
    const handleBlur = () => startBlurTimer();
    const handleFocus = () => { clearBlurTimer(); resetTimer(); };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    // Fresh tab/launch with no live session marker → treat as closed → sign out
    // The marker is set here and lives for the lifetime of the document.
    try { sessionStorage.setItem("aa-session-alive", "1"); } catch {}

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearBlurTimer();
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, activityHandler));
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [resetTimer, startBlurTimer, clearBlurTimer]);
}

/**
 * Returns true if this tab/window has a live session marker. Closing the
 * tab clears sessionStorage, so a fresh launch will return false → forces re-auth.
 */
export function hasLiveSessionMarker() {
  try { return sessionStorage.getItem("aa-session-alive") === "1"; } catch { return false; }
}

export function clearLiveSessionMarker() {
  try { sessionStorage.removeItem("aa-session-alive"); } catch {}
}

/**
 * Helper to get/set timeout minutes in localStorage.
 */
export function getTimeoutMinutes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 30;
  } catch {
    return 30;
  }
}

export function setTimeoutMinutes(mins) {
  try {
    localStorage.setItem(STORAGE_KEY, String(mins));
  } catch {}
}
