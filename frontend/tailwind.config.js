/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        netflix: {
          DEFAULT: '#E50914',
          hover: '#f6121d',
          dark: '#B81D24',
          glow: 'rgba(229, 9, 20, 0.35)',
        },
        cinema: {
          bg: '#0b0c0e',
          card: '#13151b',
          surface: '#181b22',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.04)',
        }
      },
      boxShadow: {
        'netflix-glow': '0 0 35px -5px rgba(229, 9, 20, 0.3)',
        'card-cinema': '0 20px 40px -15px rgba(0, 0, 0, 0.7)',
      }
    },
  },
  plugins: [],
}
