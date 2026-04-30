/**
 * Maps contract error codes to friendly UI messages.
 * gov_token / treasury / proposal_registry each define their own variants.
 */

const GOV_TOKEN_ERRORS: Record<number, string> = {
  1: "Token already initialized",
  2: "Token not initialized",
  3: "Only the admin can perform this action",
  4: "Insufficient token balance",
  5: "Invalid amount (must be positive)",
  6: "You have already claimed from this faucet",
  7: "Arithmetic overflow",
};

const TREASURY_ERRORS: Record<number, string> = {
  1: "Treasury already initialized",
  2: "Treasury not initialized",
  3: "Invalid amount (must be positive)",
  4: "Arithmetic overflow",
};

const REGISTRY_ERRORS: Record<number, string> = {
  1: "Registry already initialized",
  2: "Registry not initialized",
  3: "Invalid amount (must be positive)",
  4: "Title cannot be empty",
  5: "Proposal not found",
  6: "You have already voted on this proposal",
  7: "You need VOTE tokens to vote — claim from the faucet",
  8: "Voting period has closed",
  9: "Voting is still open",
  10: "Proposal did not pass (quorum / majority not met)",
  11: "Proposal has already been finalized",
  12: "This proposal passed — use Execute instead",
  13: "Arithmetic overflow",
};

export function friendlyError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw);

  // Soroban contract errors appear as "Error(Contract, #N)"
  const match = msg.match(/Error\(Contract,\s*#(\d+)\)/);
  if (match) {
    const code = Number(match[1]);
    // Try registry first (most context-specific), then treasury, then gov_token
    return (
      REGISTRY_ERRORS[code] ??
      TREASURY_ERRORS[code] ??
      GOV_TOKEN_ERRORS[code] ??
      `Contract error #${code}`
    );
  }
  if (msg.includes("cancelled") || msg.includes("Closed")) {
    return "Wallet popup closed";
  }
  if (msg.includes("insufficient")) return "Insufficient balance / fee";
  if (msg.length > 200) return msg.slice(0, 200) + "…";
  return msg;
}
