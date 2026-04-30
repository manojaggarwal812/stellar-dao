export const NETWORK_PASSPHRASE =
  import.meta.env.VITE_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org";

export const GOV_TOKEN_ID = import.meta.env.VITE_GOV_TOKEN_ID ?? "";
export const TREASURY_ID = import.meta.env.VITE_TREASURY_ID ?? "";
export const REGISTRY_ID = import.meta.env.VITE_REGISTRY_ID ?? "";

export const GOV_TOKEN = {
  id: GOV_TOKEN_ID,
  name: "DAO Vote",
  symbol: "VOTE",
  decimals: 7,
} as const;

export const EXPLORER = "https://stellar.expert/explorer/testnet";

export function isConfigured() {
  return Boolean(GOV_TOKEN_ID && TREASURY_ID && REGISTRY_ID);
}
