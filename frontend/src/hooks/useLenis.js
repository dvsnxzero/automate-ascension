/**
 * useLenis — global smooth scroll + parallax helper.
 *
 * Wires a single Lenis instance to the page so scrolling glides instead of
 * snapping. Also exposes a normalized scroll value so components can drive
 * subtle parallax without each registering their own scroll listener.
 *
 * Usage:
 *   - Call `useLenisGlobal()` once at the App root.
 *   - In components, call `useScrollOffset((y) => { ... })` for parallax.
 */

import { useEffect, useRef } from "react";
import Lenis from "lenis";

let _lenis = null;
const _subscribers = new Set();

function _publish(scroll) {
  _subscribers.forEach((cb) => {
    try { cb(scroll); } catch {}
  });
}

export function useLenisGlobal() {
  useEffect(() => {
    if (_lenis) return; // already initialized

    // Respect users with reduced-motion preference.
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    _lenis = new Lenis({
      duration: 0.9, // slight ease — not slow, just smoothed
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out
      smoothWheel: true,
      smoothTouch: false, // native touch on mobile feels better
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });

    _lenis.on("scroll", (e) => _publish(e.scroll));

    let rafId = 0;
    const raf = (time) => {
      _lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      _lenis.destroy();
      _lenis = null;
    };
  }, []);
}

/**
 * Subscribe a callback to scroll position. Returns the current scroll
 * via the callback on every Lenis frame.
 *
 *   useScrollOffset((y) => setOffset(y * 0.2));
 */
export function useScrollOffset(callback) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const handler = (y) => cbRef.current?.(y);
    _subscribers.add(handler);
    return () => { _subscribers.delete(handler); };
  }, []);
}

/**
 * Imperative scroll-to. Pass a target (selector, element, or px number).
 */
export function lenisScrollTo(target, opts) {
  if (_lenis) _lenis.scrollTo(target, opts);
}
