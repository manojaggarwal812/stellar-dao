import { useState } from "react";
import { Inbox } from "lucide-react";
import { Proposal, ProposalStatus } from "../lib/stellar";
import { ProposalCard } from "./ProposalCard";

type Tab = "active" | "executed" | "defeated";

interface Props {
  proposals: Proposal[];
  address: string | null;
  quorumBps: number;
  totalSupplyHint: bigint;
  onAfter: () => void;
}

export function ProposalList({
  proposals,
  address,
  quorumBps,
  totalSupplyHint,
  onAfter,
}: Props) {
  const [tab, setTab] = useState<Tab>("active");
  const filtered = proposals.filter((p) => {
    if (tab === "active") return p.status === ProposalStatus.Active;
    if (tab === "executed") return p.status === ProposalStatus.Executed;
    return p.status === ProposalStatus.Defeated;
  });

  const counts = {
    active: proposals.filter((p) => p.status === ProposalStatus.Active).length,
    executed: proposals.filter((p) => p.status === ProposalStatus.Executed).length,
    defeated: proposals.filter((p) => p.status === ProposalStatus.Defeated).length,
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-surface/60 border border-border rounded-xl p-1 w-fit">
        {(["active", "executed", "defeated"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-fuchsia-500/20 text-fuchsia-200"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t} <span className="text-slate-500">({counts[t]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <div className="font-medium">No {tab} proposals yet</div>
          <div className="text-xs mt-1">
            {tab === "active"
              ? "Be the first to create one"
              : `No proposals in the ${tab} state yet`}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <ProposalCard
              key={p.id}
              p={p}
              address={address}
              quorumBps={quorumBps}
              totalSupplyHint={totalSupplyHint}
              onAfter={onAfter}
            />
          ))}
        </div>
      )}
    </div>
  );
}
