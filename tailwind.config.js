/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ['YekanBakh-Regular', 'sans-serif'],
        light: ['YekanBakh-Light', 'sans-serif'],
        semibold: ['YekanBakh-SemiBold', 'sans-serif'],
        bold: ['YekanBakh-Bold', 'sans-serif'],
        extrabold: ['YekanBakh-ExtraBold', 'sans-serif'],
        black: ['YekanBakh-Black', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          500: '#8b5cf6', // Playful Violet accent
          600: '#7c3aed',
        },
        surface: {
          light: '#f9fafb',
          dark: '#111827',
        }
      },
      borderRadius: {
        '4xl': '32px',
        '3xl': '24px',
      }
    },
  },
  plugins: [],
}
