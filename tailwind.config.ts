import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0f1115',
          subtle: '#161922',
          panel: '#1b1f2a'
        },
        line: '#2a2f3d',
        muted: '#8a93a6',
        text: '#e6e8ee',
        accent: {
          DEFAULT: '#5b8cff',
          hover: '#7aa1ff'
        },
        success: '#3ecf8e',
        danger: '#ff5d6c',
        warn: '#f5a623'
      },
      fontFamily: {
        mono: ['SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}

export default config
