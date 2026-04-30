export function shortenAddr(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}\u2026${addr.slice(-tail)}`;
}

/** Format a raw i128 (string or bigint) into a human string with given decimals. */
export function fromRaw(raw: string | bigint | number, decimals = 7): string {
  let big: bigint;
  try {
    big = typeof raw === "bigint" ? raw : BigInt(raw);
  } catch {
    return "0";
  }
  const negative = big < 0n;
  if (negative) big = -big;
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (decimals > 4 && fracStr.length > 4) fracStr = fracStr.slice(0, 4);
  const sign = negative ? "-" : "";
  return fracStr.length > 0 ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

/** Convert human number (e.g. "12.5") to raw i128 string scaled by decimals. */
export function toRaw(human: string, decimals = 7): string {
  if (!human) return "0";
  const trimmed = human.trim();
  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = abs.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  return (negative ? -raw : raw).toString();
}

/** Pretty-print seconds as "5d 3h 12m" style. Negative = "ended". */
export function formatDuration(totalSecs: number): string {
  if (totalSecs <= 0) return "ended";
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimestamp(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}
