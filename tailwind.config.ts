import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        df: {
          yellow: '#FFD60A',
          amber: '#E6BE00',
          black: '#000000',
          obsidian: '#090A0F',
          ink: '#0B0B0B',
          panel: '#111111',
          line: '#262626',
          mute: '#8A8A8A',
          blue: '#4FACFE',
          cyan: '#00F2FE',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
