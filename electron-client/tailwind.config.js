/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ATLAS CRAFT BRANDING
        'atlas': {
          'blue': '#2563eb',      // Primary blue
          'cyan': '#22d3ee',      // Accent cyan
          'dark': {
            '0': '#0f172a',       // Canvas
            '1': '#1e293b',       // Surface
            '2': '#334155',       // Border
            '3': '#475569',       // Disabled
            '4': '#64748b',       // Muted text
          }
        },
        // Legacy (keep for compatibility)
        background: "#0f172a",    // atlas-dark-0
        surface: "#1e293b",       // atlas-dark-1
        primary: "#2563eb",       // atlas-blue
        accent: "#22d3ee",        // atlas-cyan
        success: "#10b981",       // Success green
        warning: "#f59e0b",       // Warning amber
        error: "#ef4444",         // Error red
      },
      fontFamily: {
        'montserrat': ['Montserrat', 'sans-serif'],
        sans: ['Montserrat', 'Inter', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-atlas': 'linear-gradient(135deg, #2563eb 0%, #22d3ee 100%)',
      }
    },
  },
  plugins: [],
}
