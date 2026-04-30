import { useState } from "react";
import { PlusCircle, Loader2 } from "lucide-react";
import { registryPropose } from "../lib/stellar";
import { toRaw, fromRaw } from "../lib/format";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/errors";
import { GOV_TOKEN } from "../lib/config";

interface Props {
  address: string | null;
  proposalDeposit: bigint;
  voteBalance: bigint;
  onAfter: () => void;
}

export function CreateProposalForm({
  address,
  proposalDeposit,
  voteBalance,
  onAfter,
}: Props) {
  const { push, update } = useToast();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit =
    !!address &&
    title.trim().length > 0 &&
    target.trim().startsWith("G") &&
    target.trim().length === 56 &&
    amount.trim().length > 0 &&
    Number(amount) > 0 &&
    voteBalance >= proposalDeposit &&
    !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;
    setBusy(true);
    const tid = push({
      variant: "loading",
      title: "Submitting proposal…",
      description: `Locking ${fromRaw(proposalDeposit, GOV_TOKEN.decimals)} VOTE as deposit`,
    });
    try {
      const res = await registryPropose(
        address,
        title.trim(),
        target.trim(),
        BigInt(toRaw(amount.trim(), GOV_TOKEN.decimals))
      );
      update(tid, {
        variant: "success",
        title: "Proposal created",
        description: "Now it's open for voting",
        txHash: res.hash,
      });
      setTitle("");
      setTarget("");
      setAmount("");
      onAfter();
    } catch (err) {
      update(tid, {
        variant: "error",
        title: "Proposal failed",
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  const insufficientDeposit = !!address && voteBalance < proposalDeposit;

  return (
    <form className="card space-y-3" onSubmit={onSubmit}>
      <div className="flex items-center gap-2 text-fuchsia-300">
        <PlusCircle className="w-5 h-5" />
        <h3 className="font-semibold">Create proposal</h3>
      </div>

      <div>
        <label className="stat-label block mb-1.5">Title</label>
        <input
          className="input"
          placeholder="e.g. Pay 500 VOTE grant to @contributor"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />
      </div>

      <div>
        <label className="stat-label block mb-1.5">Target (recipient G-address)</label>
        <input
          className="input font-mono text-sm"
          placeholder="GABCDEF…"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div>
        <label className="stat-label block mb-1.5">Amount (VOTE)</label>
        <input
          className="input"
          type="number"
          step="any"
          min="0"
          placeholder="500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
        <span>
          Deposit: <b className="text-slate-200">{fromRaw(proposalDeposit, GOV_TOKEN.decimals)} VOTE</b>
          <span className="text-slate-500"> · refunded if it passes</span>
        </span>
        <span>
          Your VOTE:{" "}
          <b className={insufficientDeposit ? "text-rose-400" : "text-slate-200"}>
            {fromRaw(voteBalance, GOV_TOKEN.decimals)}
          </b>
        </span>
      </div>

      {insufficientDeposit && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          Claim the VOTE faucet first — you need at least{" "}
          {fromRaw(proposalDeposit, GOV_TOKEN.decimals)} VOTE to propose.
        </div>
      )}

      <button className="btn-primary w-full" disabled={!canSubmit}>
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
          </>
        ) : (
          <>Submit proposal</>
        )}
      </button>
    </form>
  );
}
