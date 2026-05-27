import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0e14',
          subtle: '#11151d',
          panel: '#161b25'
        },
        line: '#252b38',
        muted: '#8a93a6',
        text: '#e6e8ee',
        accent: {
          DEFAULT: '#5b8cff',
          hover: '#7aa1ff'
        },
        success: '#3ecf8e',
        danger: '#ff5d6c',
        warn: '#f5a623',
        // Transit-line palette
        transit: {
          blue: '#5b8cff',
          purple: '#a672ff',
          green: '#3ecf8e',
          teal: '#56cfe1',
          orange: '#ff8a5b',
          red: '#ff5d6c',
          yellow: '#ffd166',
          gray: '#5a6275',
          pink: '#ff8fab'
        },
        track: '#1a2030'
      },
      fontFamily: {
        mono: ['SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      keyframes: {
        'train-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' }
        }
      },
      animation: {
        'train-pulse': 'train-pulse 1.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
}

export default config
