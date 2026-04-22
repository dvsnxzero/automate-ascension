import { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeContext = createContext();

const STORAGE_KEY = "aa-theme-pref"; // "light" | "dark" | "auto"

function getSystemPrefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

function isNightTime() {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 18; // dark from 6 PM to 6 AM
}

function resolveTheme(pref) {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  // auto: use time of day
  return isNightTime() ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "auto";
    } catch {
      return "auto";
    }
  });

  const [resolved, setResolved] = useState(() => resolveTheme(preference));

  // Apply the resolved theme to <html>
  const applyTheme = useCallback((theme) => {
    const html = document.documentElement;
    // Add transition class briefly for smooth switching
    html.classList.add("theme-transitioning");
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    // Remove transition class after animation completes
    setTimeout(() => html.classList.remove("theme-transitioning"), 350);
  }, []);

  // When preference changes, persist and resolve
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {}
    const newResolved = resolveTheme(preference);
    setResolved(newResolved);
    applyTheme(newResolved);
  }, [preference, applyTheme]);

  // For auto mode: re-check every minute so it switches at 6am/6pm
  useEffect(() => {
    if (preference !== "auto") return;

    const interval = setInterval(() => {
      const newResolved = resolveTheme("auto");
      setResolved((prev) => {
        if (prev !== newResolved) {
          applyTheme(newResolved);
          return newResolved;
        }
        return prev;
      });
    }, 60_000); // check every minute

    return () => clearInterval(interval);
  }, [preference, applyTheme]);

  // On mount, apply immediately (no transition)
  useEffect(() => {
    const theme = resolveTheme(preference);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setTheme = useCallback((pref) => {
    setPreference(pref);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference((prev) => {
      if (prev === "auto") return resolved === "dark" ? "light" : "dark";
      return prev === "dark" ? "light" : "dark";
    });
  }, [resolved]);

  return (
    <ThemeContext.Provider
      value={{
        preference,   // "light" | "dark" | "auto"
        resolved,     // "light" | "dark" (actual applied theme)
        setTheme,     // (pref) => void
        toggleTheme,  // () => void
        isDark: resolved === "dark",
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
