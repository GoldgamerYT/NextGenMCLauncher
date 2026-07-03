/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        surface:    "var(--surface)",
        surface2:   "var(--surface2)",
        primary:    "var(--accent)",
        accent:     "var(--accent)",
        success:    "var(--success)",
        danger:     "var(--danger)",
        error:      "var(--danger)",
        warning:    "var(--warning)",
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
