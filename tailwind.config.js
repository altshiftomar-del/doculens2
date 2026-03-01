/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#04080F',
          900: '#080D18',
          800: '#0D1424',
          700: '#111B2E',
          600: '#162038',
        },
        cyan: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        slate: {
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
        }
      },
      fontFamily: {
        display: ['var(--font-space)', 'monospace'],
        mono: ['var(--font-jetbrains)', 'monospace'],
        body: ['var(--font-dm)', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan-line': 'scan 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
      },
      keyframes: {
        scan: {
          '0%, 100%': { transform: 'translateY(0%)', opacity: '0.6' },
          '50%': { transform: 'translateY(100%)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
