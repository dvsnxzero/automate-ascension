/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Theme-aware colors via CSS variables
        accent: "var(--color-accent)",
        "accent-dim": "var(--color-accent-dim)",
        "accent-bg": "var(--color-accent-bg)",
        surface: "var(--color-surface)",
        "surface-light": "var(--color-surface-light)",
        border: "var(--color-border)",
        "border-light": "var(--color-border-light)",
        muted: "var(--color-muted)",
        bull: "var(--color-bull)",
        bear: "var(--color-bear)",
        "theme-bg": "var(--color-bg)",
        "theme-bg-alt": "var(--color-bg-alt)",
        "theme-text": "var(--color-text)",
        "theme-text-secondary": "var(--color-text-secondary)",
        paper: "var(--color-accent)",
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Space Mono"', '"SF Mono"', 'monospace'],
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};
