/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue:    '#006aff',
          cyan:    '#00c1ff',
          dark:    '#0b171b',
          darker:  '#091318',
          mid:     '#0d2a3a',
          border:  '#1a3d52',
          muted:   '#5a8a9f',
          text:    '#a0c4d8',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #006aff, #00c1ff)',
        'gradient-brand-r': 'linear-gradient(135deg, #00c1ff, #006aff)',
      },
      boxShadow: {
        'glow-sm':  '0 0 12px rgba(0,106,255,0.35)',
        'glow':     '0 0 24px rgba(0,106,255,0.4), 0 0 60px rgba(0,106,255,0.1)',
        'glow-lg':  '0 0 40px rgba(0,106,255,0.5), 0 0 100px rgba(0,193,255,0.15)',
        'glow-cyan':'0 0 24px rgba(0,193,255,0.45), 0 0 60px rgba(0,193,255,0.1)',
        'glow-red': '0 0 20px rgba(239,68,68,0.4)',
        'glow-green':'0 0 20px rgba(34,197,94,0.4)',
      },
      animation: {
        'glow-pulse':     'glowPulse 3s ease-in-out infinite',
        'float':          'float 7s ease-in-out infinite',
        'float-slow':     'float 11s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease infinite',
        'orb-drift':      'orbDrift 18s ease-in-out infinite',
        'orb-drift-r':    'orbDrift 22s ease-in-out infinite reverse',
        'fade-up':        'fadeUp 0.6s ease forwards',
        'spin-slow':      'spin 12s linear infinite',
        'marquee':        'marquee 20s linear infinite',
        'ping-slow':      'ping 3s cubic-bezier(0,0,.2,1) infinite',
        'word-switch':    'wordSwitch 0.4s ease forwards',
      },
      keyframes: {
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 20px rgba(0,106,255,0.3)' },
          '50%':     { boxShadow: '0 0 50px rgba(0,193,255,0.6), 0 0 100px rgba(0,106,255,0.2)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%':     { transform: 'translateY(-18px) rotate(3deg)' },
        },
        gradientShift: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%':     { backgroundPosition: '100% 50%' },
        },
        orbDrift: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%':     { transform: 'translate(40px,-30px) scale(1.1)' },
          '66%':     { transform: 'translate(-30px,20px) scale(0.95)' },
        },
        fadeUp: {
          from: { opacity: 0, transform: 'translateY(24px)' },
          to:   { opacity: 1, transform: 'translateY(0)' },
        },
        wordSwitch: {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to:   { opacity: 1, transform: 'translateY(0)' },
        },
        marquee: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','Segoe UI','Roboto','sans-serif'],
      },
    },
  },
  plugins: [],
}
