import {
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Address,
  Account,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  NETWORK_PASSPHRASE,
  RPC_URL,
  GOV_TOKEN_ID,
  TREASURY_ID,
  REGISTRY_ID,
} from "./config";
import { signXdr } from "./wallet";

export const server = new rpc.Server(RPC_URL, {
  allowHttp: RPC_URL.startsWith("http://"),
});

const DUMMY = Keypair.random().publicKey();

async function simulate(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
) {
  const tx = new TransactionBuilder(new Account(DUMMY, "0"), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  if (!("result" in sim) || !sim.result) throw new Error("No simulation result");
  return scValToNative(sim.result.retval);
}

async function sendTx(
  caller: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<{ hash: string; result: unknown }> {
  const account = await server.getAccount(caller);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(built);
  const signed = await signXdr(prepared.toXDR());
  const tx = TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE);
  const send = await server.sendTransaction(tx);
  if (send.status === "ERROR") {
    throw new Error(`Send failed: ${JSON.stringify(send.errorResult ?? send)}`);
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const status = await server.getTransaction(send.hash);
    if (status.status === "SUCCESS") {
      let result: unknown = null;
      try {
        const ret = (status as { returnValue?: xdr.ScVal }).returnValue;
        if (ret) result = scValToNative(ret);
      } catch {
        /* ignore */
      }
      return { hash: send.hash, result };
    }
    if (status.status === "FAILED")
      throw new Error("Transaction failed on-chain");
  }
  throw new Error("Transaction timed out");
}

const addr = (a: string) => new Address(a).toScVal();
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
const bool = (b: boolean) => nativeToScVal(b, { type: "bool" });
const str = (s: string) => nativeToScVal(s, { type: "string" });

// ─── Proposal status enum mirror ────────────────────────────────────────
export enum ProposalStatus {
  Active = 0,
  Executed = 1,
  Defeated = 2,
}

export interface Proposal {
  id: number;
  proposer: string;
  title: string;
  target: string;
  amount: bigint;
  created_at: number;
  voting_ends: number;
  for_votes: bigint;
  against_votes: bigint;
  status: ProposalStatus;
  deposit: bigint;
}

// ─── gov_token reads ────────────────────────────────────────────────────
export async function govSymbol(): Promise<string> {
  if (!GOV_TOKEN_ID) return "VOTE";
  return String(await simulate(GOV_TOKEN_ID, "symbol"));
}
export async function govBalance(who: string): Promise<bigint> {
  if (!GOV_TOKEN_ID || !who) return 0n;
  return BigInt(await simulate(GOV_TOKEN_ID, "balance", [addr(who)]));
}
export async function govClaimed(who: string): Promise<boolean> {
  if (!GOV_TOKEN_ID || !who) return false;
  return Boolean(await simulate(GOV_TOKEN_ID, "claimed", [addr(who)]));
}

// ─── gov_token writes ───────────────────────────────────────────────────
export async function govFaucet(user: string) {
  return sendTx(user, GOV_TOKEN_ID, "faucet", [addr(user)]);
}

// ─── treasury reads ─────────────────────────────────────────────────────
export async function treasuryBalance(): Promise<bigint> {
  if (!TREASURY_ID) return 0n;
  return BigInt(await simulate(TREASURY_ID, "balance"));
}
export async function treasuryTotalReleased(): Promise<bigint> {
  if (!TREASURY_ID) return 0n;
  return BigInt(await simulate(TREASURY_ID, "total_released"));
}
// optional: donate to the treasury
export async function treasuryDeposit(user: string, amount: bigint) {
  return sendTx(user, TREASURY_ID, "deposit", [addr(user), i128(amount)]);
}

// ─── registry reads ─────────────────────────────────────────────────────
export async function registryCount(): Promise<number> {
  if (!REGISTRY_ID) return 0;
  return Number(await simulate(REGISTRY_ID, "count"));
}
export async function registryVotingPeriod(): Promise<number> {
  if (!REGISTRY_ID) return 0;
  return Number(await simulate(REGISTRY_ID, "voting_period"));
}
export async function registryDeposit(): Promise<bigint> {
  if (!REGISTRY_ID) return 0n;
  return BigInt(await simulate(REGISTRY_ID, "proposal_deposit"));
}
export async function registryQuorumBps(): Promise<number> {
  if (!REGISTRY_ID) return 0;
  return Number(await simulate(REGISTRY_ID, "quorum_bps"));
}
export async function registryTotalSupplyHint(): Promise<bigint> {
  if (!REGISTRY_ID) return 0n;
  return BigInt(await simulate(REGISTRY_ID, "total_supply_hint"));
}
export async function registryHasVoted(id: number, voter: string): Promise<boolean> {
  if (!REGISTRY_ID || !voter) return false;
  return Boolean(await simulate(REGISTRY_ID, "has_voted", [u32(id), addr(voter)]));
}
export async function registryGet(id: number): Promise<Proposal | null> {
  if (!REGISTRY_ID) return null;
  const raw = await simulate(REGISTRY_ID, "get", [u32(id)]);
  if (!raw) return null;
  // Soroban returns the struct as a Map with snake_case keys
  return normalizeProposal(raw);
}

// Fetch N most recent proposals (ids `count` .. `count - n + 1`)
export async function registryList(n = 10): Promise<Proposal[]> {
  const total = await registryCount();
  const out: Proposal[] = [];
  const start = Math.max(1, total - n + 1);
  const ids: number[] = [];
  for (let i = total; i >= start; i--) ids.push(i);
  const proposals = await Promise.all(ids.map((id) => registryGet(id)));
  for (const p of proposals) if (p) out.push(p);
  return out;
}

function normalizeProposal(raw: unknown): Proposal {
  const r = raw as Record<string, unknown>;
  const statusNum = Number(r.status ?? 0);
  return {
    id: Number(r.id ?? 0),
    proposer: String(r.proposer ?? ""),
    title: String(r.title ?? ""),
    target: String(r.target ?? ""),
    amount: BigInt((r.amount as bigint | string | number) ?? 0),
    created_at: Number(r.created_at ?? 0),
    voting_ends: Number(r.voting_ends ?? 0),
    for_votes: BigInt((r.for_votes as bigint | string | number) ?? 0),
    against_votes: BigInt((r.against_votes as bigint | string | number) ?? 0),
    deposit: BigInt((r.deposit as bigint | string | number) ?? 0),
    status: statusNum as ProposalStatus,
  };
}

// ─── registry writes ────────────────────────────────────────────────────
export async function registryPropose(
  user: string,
  title: string,
  target: string,
  amount: bigint
) {
  return sendTx(user, REGISTRY_ID, "propose", [
    addr(user),
    str(title),
    addr(target),
    i128(amount),
  ]);
}

export async function registryVote(user: string, id: number, support: boolean) {
  return sendTx(user, REGISTRY_ID, "vote", [addr(user), u32(id), bool(support)]);
}

export async function registryExecute(user: string, id: number) {
  return sendTx(user, REGISTRY_ID, "execute", [addr(user), u32(id)]);
}

export async function registryFinalizeDefeated(user: string, id: number) {
  return sendTx(user, REGISTRY_ID, "finalize_defeated", [u32(id)]);
}

// Re-export IDs for convenience
export { GOV_TOKEN_ID, TREASURY_ID, REGISTRY_ID };
