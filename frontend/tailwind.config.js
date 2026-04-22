/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ZipTrader luxe palette — black + chartreuse/yellow
        accent: "#DCFC36",       // primary chartreuse-yellow
        "accent-dim": "#B8D430", // dimmed accent for hover
        surface: "#111111",      // card backgrounds
        "surface-light": "#1A1A1A", // lighter card variant
        border: "#2A2A2A",       // card borders
        "border-light": "#3A3A3A",  // lighter borders (hover)
        muted: "#666666",        // muted text
        bull: "#DCFC36",         // gains — matches accent
        bear: "#FF4757",         // losses — red
        paper: "#DCFC36",        // paper trading badge
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
