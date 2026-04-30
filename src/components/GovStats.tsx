import { Wallet, Coins, Landmark, FileText } from "lucide-react";
import { fromRaw } from "../lib/format";
import { GOV_TOKEN } from "../lib/config";

interface Props {
  voteBalance: bigint;
  treasuryBalance: bigint;
  totalReleased: bigint;
  proposalCount: number;
  quorumBps: number;
  totalSupplyHint: bigint;
}

export function GovStats({
  voteBalance,
  treasuryBalance,
  totalReleased,
  proposalCount,
  quorumBps,
  totalSupplyHint,
}: Props) {
  const quorumAmount = (totalSupplyHint * BigInt(quorumBps)) / 10_000n;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="card">
        <div className="flex items-center gap-2 text-fuchsia-400 mb-2">
          <Wallet className="w-4 h-4" />
          <span className="stat-label">Your VOTE</span>
        </div>
        <div className="stat-value">{fromRaw(voteBalance, GOV_TOKEN.decimals)}</div>
        <div className="text-xs text-slate-400 mt-1">voting weight</div>
      </div>
      <div className="card">
        <div className="flex items-center gap-2 text-purple-400 mb-2">
          <Landmark className="w-4 h-4" />
          <span className="stat-label">Treasury</span>
        </div>
        <div className="stat-value">{fromRaw(treasuryBalance, GOV_TOKEN.decimals)}</div>
        <div className="text-xs text-slate-400 mt-1">VOTE locked</div>
      </div>
      <div className="card">
        <div className="flex items-center gap-2 text-emerald-400 mb-2">
          <Coins className="w-4 h-4" />
          <span className="stat-label">Released</span>
        </div>
        <div className="stat-value">{fromRaw(totalReleased, GOV_TOKEN.decimals)}</div>
        <div className="text-xs text-slate-400 mt-1">all-time payout</div>
      </div>
      <div className="card">
        <div className="flex items-center gap-2 text-sky-400 mb-2">
          <FileText className="w-4 h-4" />
          <span className="stat-label">Proposals</span>
        </div>
        <div className="stat-value">{proposalCount}</div>
        <div className="text-xs text-slate-400 mt-1">
          quorum: {fromRaw(quorumAmount, GOV_TOKEN.decimals)} VOTE
        </div>
      </div>
    </div>
  );
}
