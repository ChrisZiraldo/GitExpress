import type { GitApi } from './index'

declare global {
  interface Window {
    git: GitApi
  }
}

export {}
