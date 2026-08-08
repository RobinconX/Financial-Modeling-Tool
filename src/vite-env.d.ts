/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. `/Financial-Modeling-Tool/` for project Pages */
  readonly VITE_BASE?: string
  /** e.g. `https://fmt-market-api.you.workers.dev` — quote/FX proxy for static hosts */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
