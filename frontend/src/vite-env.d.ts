/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Destino del proxy de Vite en desarrollo (`/v1`, `/health`). Por defecto `http://127.0.0.1:8000`. */
  readonly VITE_DEV_PROXY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
