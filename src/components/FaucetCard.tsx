import { useState } from "react";
import { Droplets, Check, Loader2 } from "lucide-react";
import { govFaucet } from "../lib/stellar";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/errors";

interface Props {
  address: string | null;
  claimed: boolean;
  onAfter: () => void;
}

export function FaucetCard({ address, claimed, onAfter }: Props) {
  const { push, update } = useToast();
  const [busy, setBusy] = useState(false);

  async function onClaim() {
    if (!address) return;
    setBusy(true);
    const tid = push({
      variant: "loading",
      title: "Claiming 1,000 VOTE…",
      description: "Confirm in your wallet and wait for ledger inclusion",
    });
    try {
      const res = await govFaucet(address);
      update(tid, {
        variant: "success",
        title: "Faucet claimed",
        description: "You received 1,000 VOTE tokens",
        txHash: res.hash,
      });
      onAfter();
    } catch (err) {
      update(tid, {
        variant: "error",
        title: "Claim failed",
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-purple-600/20 border border-fuchsia-500/30 flex items-center justify-center shrink-0">
          <Droplets className="w-6 h-6 text-fuchsia-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white">VOTE Faucet</div>
          <div className="text-sm text-slate-400">
            One-time claim of 1,000 VOTE governance tokens. Your VOTE balance
            is your voting weight on proposals.
          </div>
          <div className="mt-3">
            {claimed ? (
              <span className="chip-green">
                <Check className="w-3 h-3" /> Already claimed
              </span>
            ) : (
              <button
                className="btn-primary w-full sm:w-auto"
                disabled={!address || busy}
                onClick={onClaim}
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Claiming…
                  </>
                ) : (
                  <>Claim 1,000 VOTE</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
