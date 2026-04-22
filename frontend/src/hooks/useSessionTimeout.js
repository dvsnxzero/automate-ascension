import { useEffect, useRef, useCallback } from "react";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY = "aa-timeout-mins";
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

/**
 * Session timeout hook.
 * Logs the user out after a period of inactivity.
 * @param {Function} onTimeout - called when timeout fires (e.g., logout)
 * @param {number} [timeoutMs] - override timeout in ms (default reads from localStorage or 30 min)
 */
export function useSessionTimeout(onTimeout, timeoutMs) {
  const timerRef = useRef(null);
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

  useEffect(() => {
    // Start the timer
    resetTimer();

    // Reset on any activity
    const handler = () => resetTimer();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
    };
  }, [resetTimer]);
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
