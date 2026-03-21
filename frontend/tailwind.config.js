/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Academic slate palette
        primary: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
        },
        accent: {
          50: '#e6f6f0',
          100: '#b3e5d1',
          200: '#80d4b2',
          300: '#4dc393',
          400: '#27b67a',
          500: '#1a9462',
          600: '#15764e',
          700: '#10583b',
          800: '#0b3a27',
          900: '#061c13',
        },
      },
      fontFamily: {
        'serif-np': ['"Noto Serif Devanagari"', 'Georgia', 'serif'],
        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}