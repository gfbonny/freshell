/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_CWD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.mp3' {
  const src: string
  export default src
}
