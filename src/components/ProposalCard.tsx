import { useEffect, useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Hammer,
  Loader2,
  User,
  ArrowRight,
} from "lucide-react";
import {
  Proposal,
  ProposalStatus,
  registryVote,
  registryExecute,
  registryFinalizeDefeated,
  registryHasVoted,
} from "../lib/stellar";
import { fromRaw, shortenAddr, formatDuration } from "../lib/format";
import { GOV_TOKEN, EXPLORER } from "../lib/config";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/errors";

interface Props {
  p: Proposal;
  address: string | null;
  quorumBps: number;
  totalSupplyHint: bigint;
  onAfter: () => void;
}

export function ProposalCard({
  p,
  address,
  quorumBps,
  totalSupplyHint,
  onAfter,
}: Props) {
  const { push, update } = useToast();
  const [hasVoted, setHasVoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!address) return setHasVoted(false);
    let cancelled = false;
    registryHasVoted(p.id, address).then((v) => {
      if (!cancelled) setHasVoted(v);
    });
    return () => {
      cancelled = true;
    };
  }, [address, p.id, p.for_votes, p.against_votes]);

  const totalVotes = p.for_votes + p.against_votes;
  const forPct =
    totalVotes > 0n ? Number((p.for_votes * 10000n) / totalVotes) / 100 : 0;
  const againstPct =
    totalVotes > 0n ? Number((p.against_votes * 10000n) / totalVotes) / 100 : 0;

  const quorumThreshold = (totalSupplyHint * BigInt(quorumBps)) / 10_000n;
  const quorumReached = p.for_votes >= quorumThreshold;
  const quorumPct =
    quorumThreshold > 0n
      ? Math.min(
          100,
          Number((p.for_votes * 10000n) / quorumThreshold) / 100
        )
      : 0;

  const endsIn = p.voting_ends - now;
  const votingOpen = endsIn > 0 && p.status === ProposalStatus.Active;
  const canExecute =
    p.status === ProposalStatus.Active &&
    endsIn <= 0 &&
    p.for_votes > p.against_votes &&
    quorumReached;
  const canFinalize =
    p.status === ProposalStatus.Active &&
    endsIn <= 0 &&
    !(p.for_votes > p.against_votes && quorumReached);

  async function doVote(support: boolean) {
    if (!address) return;
    setBusy(true);
    const tid = push({
      variant: "loading",
      title: `Voting ${support ? "FOR" : "AGAINST"}…`,
      description: `Proposal #${p.id}`,
    });
    try {
      const res = await registryVote(address, p.id, support);
      update(tid, {
        variant: "success",
        title: "Vote recorded",
        description: `Your weight was added to the ${support ? "for" : "against"} side`,
        txHash: res.hash,
      });
      setHasVoted(true);
      onAfter();
    } catch (err) {
      update(tid, {
        variant: "error",
        title: "Vote failed",
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function doExecute() {
    if (!address) return;
    setBusy(true);
    const tid = push({
      variant: "loading",
      title: "Executing proposal…",
      description: "Treasury release + 5% executor reward + refund to proposer",
    });
    try {
      const res = await registryExecute(address, p.id);
      update(tid, {
        variant: "success",
        title: "Proposal executed",
        description: "You earned the 5% executor reward 🎉",
        txHash: res.hash,
      });
      onAfter();
    } catch (err) {
      update(tid, {
        variant: "error",
        title: "Execute failed",
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function doFinalize() {
    if (!address) return;
    setBusy(true);
    const tid = push({
      variant: "loading",
      title: "Finalizing defeat…",
      description: "Deposit will be forfeited to the treasury",
    });
    try {
      const res = await registryFinalizeDefeated(address, p.id);
      update(tid, {
        variant: "success",
        title: "Proposal finalized",
        description: "Deposit moved to treasury",
        txHash: res.hash,
      });
      onAfter();
    } catch (err) {
      update(tid, {
        variant: "error",
        title: "Finalize failed",
        description: friendlyError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <span className="font-mono">#{p.id}</span>
            <span>·</span>
            <User className="w-3 h-3" />
            <a
              href={`${EXPLORER}/account/${p.proposer}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-200 font-mono"
            >
              {shortenAddr(p.proposer)}
            </a>
          </div>
          <div className="font-semibold text-white mt-0.5 break-words">
            {p.title}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-300 mt-1">
            <span className="font-mono text-slate-400">
              {shortenAddr(p.target)}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <b>{fromRaw(p.amount, GOV_TOKEN.decimals)}</b>
            <span className="text-slate-400">VOTE</span>
          </div>
        </div>
        <StatusBadge p={p} votingOpen={votingOpen} canExecute={canExecute} />
      </div>

      {/* Vote bars */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-emerald-300">
            For {fromRaw(p.for_votes, GOV_TOKEN.decimals)} ({forPct.toFixed(1)}%)
          </span>
          <span className="text-rose-300">
            Against {fromRaw(p.against_votes, GOV_TOKEN.decimals)} ({againstPct.toFixed(1)}%)
          </span>
        </div>
        <div className="h-2 bg-slate-800/60 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${forPct}%` }}
          />
          <div
            className="bg-rose-500 transition-all"
            style={{ width: `${againstPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>
            Quorum: {fromRaw(p.for_votes, GOV_TOKEN.decimals)} /{" "}
            {fromRaw(quorumThreshold, GOV_TOKEN.decimals)}{" "}
            {quorumReached ? (
              <span className="text-emerald-400 font-medium">✓ reached</span>
            ) : (
              <span className="text-amber-400">({quorumPct.toFixed(0)}%)</span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {votingOpen ? formatDuration(endsIn) : "voting closed"}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      {p.status === ProposalStatus.Active && (
        <div className="flex gap-2 pt-1 flex-wrap">
          {votingOpen && !hasVoted && (
            <>
              <button
                className="btn-success flex-1 min-w-[110px]"
                disabled={!address || busy}
                onClick={() => doVote(true)}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                Vote For
              </button>
              <button
                className="btn-danger flex-1 min-w-[110px]"
                disabled={!address || busy}
                onClick={() => doVote(false)}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                Vote Against
              </button>
            </>
          )}
          {votingOpen && hasVoted && (
            <span className="chip-green w-full justify-center py-2">
              <CheckCircle2 className="w-4 h-4" />
              You have voted on this proposal
            </span>
          )}
          {canExecute && (
            <button
              className="btn-primary flex-1"
              disabled={!address || busy}
              onClick={doExecute}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              Execute (earn 5% reward)
            </button>
          )}
          {canFinalize && (
            <button
              className="btn-secondary flex-1"
              disabled={!address || busy}
              onClick={doFinalize}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hammer className="w-4 h-4" />}
              Finalize (mark defeated)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  p,
  votingOpen,
  canExecute,
}: {
  p: Proposal;
  votingOpen: boolean;
  canExecute: boolean;
}) {
  if (p.status === ProposalStatus.Executed) {
    return (
      <span className="chip-green">
        <CheckCircle2 className="w-3 h-3" /> Executed
      </span>
    );
  }
  if (p.status === ProposalStatus.Defeated) {
    return (
      <span className="chip-red">
        <XCircle className="w-3 h-3" /> Defeated
      </span>
    );
  }
  if (votingOpen) {
    return (
      <span className="chip-amber">
        <Clock className="w-3 h-3" /> Voting open
      </span>
    );
  }
  if (canExecute) {
    return (
      <span className="chip-green">
        <PlayCircle className="w-3 h-3" /> Ready to execute
      </span>
    );
  }
  return (
    <span className="chip">
      <Hammer className="w-3 h-3" /> Awaiting finalize
    </span>
  );
}
