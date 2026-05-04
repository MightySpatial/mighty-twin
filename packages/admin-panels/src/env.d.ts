// Minimal ImportMeta typing — matches the declaration in
// @mightyspatial/app-shell so transitively-imported source files that
// use `import.meta.env.DEV` typecheck here too.
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
