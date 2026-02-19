import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        cme: {
          bg: '#0a0a0f',
          surface: '#12121a',
          'surface-hover': '#1a1a2e',
          border: '#1e1e3a',
          'border-bright': '#2a2a5a',
          text: '#e4e4f0',
          'text-muted': '#8888a8',
          primary: '#6c5ce7',
          'primary-hover': '#7c6cf7',
          'primary-glow': 'rgba(108, 92, 231, 0.3)',
          secondary: '#00cec9',
          'secondary-glow': 'rgba(0, 206, 201, 0.3)',
          success: '#00b894',
          warning: '#fdcb6e',
          error: '#e17055',
          gradient: {
            from: '#6c5ce7',
            to: '#00cec9',
          },
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'toast-out': {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(100%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'mesh-float': {
          '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
          '33%': { transform: 'translate(30px, -30px) rotate(120deg)' },
          '66%': { transform: 'translate(-20px, 20px) rotate(240deg)' },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'toast-in': 'toast-in 0.4s ease-out',
        'toast-out': 'toast-out 0.3s ease-in forwards',
        shimmer: 'shimmer 2s infinite linear',
        pulse: 'pulse 2s ease-in-out infinite',
        'mesh-float': 'mesh-float 20s ease-in-out infinite',
        spin: 'spin 1s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
