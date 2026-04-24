/**
 * usePullToRefresh — touch-based pull-to-refresh for mobile PWA.
 *
 * Shows a pull indicator when the user drags down from the top of
 * the page. Triggers `onRefresh` callback after passing threshold.
 *
 * Usage:
 *   const { pullRef, pulling, refreshing } = usePullToRefresh(fetchAll);
 *   <div ref={pullRef}>...</div>
 */
import { useRef, useState, useEffect, useCallback } from "react";

const THRESHOLD = 80; // px of pull required to trigger refresh

export default function usePullToRefresh(onRefresh) {
  const pullRef = useRef(null);
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e) => {
    // Only trigger at top of scroll
    if (window.scrollY > 5) return;
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging.current || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      setPulling(true);
      setPullDistance(Math.min(dy * 0.5, THRESHOLD * 1.5));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (pullDistance >= THRESHOLD && onRefresh) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.5);
      try {
        await onRefresh();
      } catch {
        // silently fail
      }
      setRefreshing(false);
    }

    setPulling(false);
    setPullDistance(0);
  }, [pullDistance, onRefresh]);

  useEffect(() => {
    const el = pullRef.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullRef, pulling, pullDistance, refreshing };
}
