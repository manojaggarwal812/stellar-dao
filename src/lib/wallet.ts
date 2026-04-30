import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
  ISupportedWallet,
} from "@creit.tech/stellar-wallets-kit";
import { NETWORK_PASSPHRASE } from "./config";

let kit: StellarWalletsKit | null = null;

function getKit(): StellarWalletsKit {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: allowAllModules(),
    });
  }
  return kit;
}

const STORAGE_KEY = "stellardao.walletId";

export async function openWalletPicker(
  forceFresh = true
): Promise<{ address: string; walletId: string }> {
  const k = getKit();
  if (forceFresh) localStorage.removeItem(STORAGE_KEY);

  return new Promise((resolve, reject) => {
    k.openModal({
      onWalletSelected: async (option: ISupportedWallet) => {
        try {
          k.setWallet(option.id);
          const { address } = await k.getAddress();
          localStorage.setItem(STORAGE_KEY, option.id);
          resolve({ address, walletId: option.id });
        } catch (err) {
          reject(err);
        }
      },
      onClosed: () => reject(new Error("wallet selection cancelled")),
    });
  });
}

export async function restoreWallet(): Promise<string | null> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const k = getKit();
    k.setWallet(stored);
    const { address } = await k.getAddress();
    return address;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function disconnectWallet() {
  localStorage.removeItem(STORAGE_KEY);
  kit = null;
}

export async function signXdr(xdr: string): Promise<string> {
  const k = getKit();
  const { signedTxXdr } = await k.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  return signedTxXdr;
}
