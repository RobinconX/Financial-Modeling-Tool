/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. `/Financial-Modeling-Tool/` for project Pages */
  readonly VITE_BASE?: string
  /** e.g. `https://fmt-market-api.you.workers.dev` — quote/FX proxy for static hosts */
  readonly VITE_API_BASE?: string
  /** Web3Forms access key — anonymous in-app feedback (see docs/GITHUB_PAGES.md) */
  readonly VITE_FEEDBACK_FORM_ACCESS_KEY?: string
  /** Git commit SHA from the Pages build workflow */
  readonly VITE_GIT_SHA?: string
  /** Package version at build time (from package.json) */
  readonly VITE_APP_PACKAGE_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
