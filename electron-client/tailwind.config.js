/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
         background: "#09090b", // Zinc 950
         surface: "#18181b",    // Zinc 900
         primary: "#2563eb",    // Blue 600
         accent: "#f59e0b",     // Amber 500
         success: "#22c55e",    // Green 500
         error: "#ef4444",      // Red 500
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
