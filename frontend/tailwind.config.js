/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#edfff6',
          100: '#d0ffeb',
          400: '#34ffb0',
          500: '#00e87b',
          600: '#00c469',
          700: '#00995a',
          900: '#003d22',
        },
        navy: {
          950: '#050a10',
          900: '#070c12',
          800: '#0e1520',
          700: '#141e2c',
          600: '#1a2638',
          500: '#1e2d3d',
          400: '#2a3f52',
          300: '#3d5a70',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-xs': '0 0 8px rgba(0, 232, 123, 0.12)',
        'glow-sm': '0 0 14px rgba(0, 232, 123, 0.18)',
        'glow':    '0 0 24px rgba(0, 232, 123, 0.22)',
        'glow-lg': '0 0 48px rgba(0, 232, 123, 0.28)',
        'glass':   '0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
        'card':    '0 2px 16px rgba(0,0,0,0.35)',
        'card-hover': '0 6px 36px rgba(0,0,0,0.55)',
        'inset-top': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      animation: {
        'fade-up':       'fadeUp 0.45s ease-out both',
        'fade-in':       'fadeIn 0.3s ease-out both',
        'slide-left':    'slideInLeft 0.35s ease-out both',
        'scale-in':      'scaleIn 0.25s ease-out both',
        'shimmer':       'shimmer 1.8s infinite',
        'float':         'float 3.5s ease-in-out infinite',
        'glow-pulse':    'glowPulse 2.5s ease-in-out infinite',
        'spin-slow':     'spin 2s linear infinite',
        'bounce-soft':   'bounceSoft 1.2s ease-in-out infinite',
        'slide-up-fade': 'slideUpFade 0.3s ease-out both',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-22px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.93)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-7px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(0,232,123,0.15)' },
          '50%':      { boxShadow: '0 0 28px rgba(0,232,123,0.38)' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-3px)' },
        },
        slideUpFade: {
          '0%':   { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern': "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
