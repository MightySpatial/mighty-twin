// Minimal ImportMeta.env typing for Vite consumers. We don't take a hard dep
// on vite/client types because app-shell doesn't ship Vite itself — its
// consumers do.
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
