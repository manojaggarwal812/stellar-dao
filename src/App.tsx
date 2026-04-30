import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ToastProvider } from "./lib/toast";
import { WalletBar } from "./components/WalletBar";
import { GovStats } from "./components/GovStats";
import { FaucetCard } from "./components/FaucetCard";
import { CreateProposalForm } from "./components/CreateProposalForm";
import { ProposalList } from "./components/ProposalList";
import {
  govBalance,
  govClaimed,
  treasuryBalance,
  treasuryTotalReleased,
  registryCount,
  registryDeposit,
  registryQuorumBps,
  registryTotalSupplyHint,
  registryList,
  Proposal,
} from "./lib/stellar";
import { isConfigured } from "./lib/config";

export default function App() {
  return (
    <ToastProvider>
      <Main />
    </ToastProvider>
  );
}

function Main() {
  const [address, setAddress] = useState<string | null>(null);
  const [voteBalance, setVoteBalance] = useState<bigint>(0n);
  const [claimed, setClaimed] = useState(false);
  const [treasuryBal, setTreasuryBal] = useState<bigint>(0n);
  const [totalReleased, setTotalReleased] = useState<bigint>(0n);
  const [proposalCount, setProposalCount] = useState(0);
  const [proposalDeposit, setProposalDeposit] = useState<bigint>(0n);
  const [quorumBps, setQuorumBps] = useState<number>(0);
  const [totalSupplyHint, setTotalSupplyHint] = useState<bigint>(0n);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isConfigured()) return;
    setLoading(true);
    try {
      const [tb, tr, pc, pd, qb, tsh] = await Promise.all([
        treasuryBalance(),
        treasuryTotalReleased(),
        registryCount(),
        registryDeposit(),
        registryQuorumBps(),
        registryTotalSupplyHint(),
      ]);
      setTreasuryBal(tb);
      setTotalReleased(tr);
      setProposalCount(pc);
      setProposalDeposit(pd);
      setQuorumBps(qb);
      setTotalSupplyHint(tsh);
      const list = await registryList(20);
      setProposals(list);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!address) {
      setVoteBalance(0n);
      setClaimed(false);
      return;
    }
    const [b, c] = await Promise.all([govBalance(address), govClaimed(address)]);
    setVoteBalance(b);
    setClaimed(c);
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshUser()]);
  }, [refresh, refreshUser]);

  if (!isConfigured()) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="card max-w-lg text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <div className="text-lg font-semibold">Contracts not configured</div>
          <p className="text-sm text-slate-400">
            Deploy the contracts with{" "}
            <code className="bg-slate-800/80 rounded px-1">npm run deploy</code> (or{" "}
            <code className="bg-slate-800/80 rounded px-1">scripts/deploy.ps1</code>)
            and fill in <code className="bg-slate-800/80 rounded px-1">.env.local</code>{" "}
            with the contract IDs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <WalletBar address={address} onChange={setAddress} />
      <main className="mx-auto max-w-6xl px-4 py-5 space-y-5 pb-20">
        <GovStats
          voteBalance={voteBalance}
          treasuryBalance={treasuryBal}
          totalReleased={totalReleased}
          proposalCount={proposalCount}
          quorumBps={quorumBps}
          totalSupplyHint={totalSupplyHint}
        />

        <div className="grid md:grid-cols-2 gap-4">
          <FaucetCard
            address={address}
            claimed={claimed}
            onAfter={refreshAll}
          />
          <CreateProposalForm
            address={address}
            proposalDeposit={proposalDeposit}
            voteBalance={voteBalance}
            onAfter={refreshAll}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Proposals</h2>
            {loading && (
              <span className="text-xs text-slate-400">refreshing…</span>
            )}
          </div>
          <ProposalList
            proposals={proposals}
            address={address}
            quorumBps={quorumBps}
            totalSupplyHint={totalSupplyHint}
            onAfter={refreshAll}
          />
        </div>

        <footer className="text-center text-xs text-slate-500 pt-8">
          Stellar DAO · Soroban Testnet · Built for the Stellar Frontend
          Challenge (Green Belt)
        </footer>
      </main>
    </div>
  );
}
