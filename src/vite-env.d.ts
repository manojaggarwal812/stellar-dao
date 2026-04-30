/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK_PASSPHRASE?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_GOV_TOKEN_ID?: string;
  readonly VITE_TREASURY_ID?: string;
  readonly VITE_REGISTRY_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
