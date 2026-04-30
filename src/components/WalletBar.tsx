import { useEffect, useState } from "react";
import { Vote, LogOut, RefreshCw, Copy, Check } from "lucide-react";
import { openWalletPicker, restoreWallet, disconnectWallet } from "../lib/wallet";
import { shortenAddr } from "../lib/format";
import { friendlyError } from "../lib/errors";
import { useToast } from "../lib/toast";

interface Props {
  address: string | null;
  onChange: (addr: string | null) => void;
}

export function WalletBar({ address, onChange }: Props) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    restoreWallet().then((a) => {
      if (a) onChange(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(forceFresh = true) {
    setBusy(true);
    try {
      const { address: a } = await openWalletPicker(forceFresh);
      onChange(a);
    } catch (err) {
      const msg = friendlyError(err);
      if (!msg.includes("closed") && !msg.includes("cancelled")) {
        push({ variant: "error", title: "Wallet error", description: msg });
      }
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    disconnectWallet();
    onChange(null);
  }

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-400 to-purple-600 flex items-center justify-center shadow-glow">
            <Vote className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-extrabold text-lg leading-tight">Stellar DAO</div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400">
              Governance · Soroban Testnet
            </div>
          </div>
        </div>

        {!address ? (
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => connect(true)}
          >
            {busy ? "Connecting…" : "Connect Wallet"}
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {shortenAddr(address, 4, 4)}
              <button
                onClick={copy}
                className="hover:text-white"
                aria-label="copy address"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </span>
            <button
              className="btn-secondary !px-3 !py-2"
              onClick={() => connect(true)}
              disabled={busy}
              title="Switch account"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              className="btn-secondary !px-3 !py-2"
              onClick={disconnect}
              title="Disconnect"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
