import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";
import { EXPLORER } from "./config";

type Variant = "success" | "error" | "loading";
interface Toast {
  id: number;
  variant: Variant;
  title: string;
  description?: string;
  txHash?: string;
}

interface Ctx {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, t: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((cur) => [...cur, { ...t, id }]);
      if (t.variant !== "loading") {
        setTimeout(() => dismiss(id), 6000);
      }
      return id;
    },
    [dismiss]
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((cur) =>
        cur.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
      if (patch.variant && patch.variant !== "loading") {
        setTimeout(() => dismiss(id), 6000);
      }
    },
    [dismiss]
  );

  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-96">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="card !p-3.5 flex gap-3 items-start animate-in slide-in-from-bottom-2"
          >
            <div className="mt-0.5">
              {t.variant === "success" && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}
              {t.variant === "error" && (
                <XCircle className="w-5 h-5 text-rose-400" />
              )}
              {t.variant === "loading" && (
                <Loader2 className="w-5 h-5 text-fuchsia-400 animate-spin" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white">{t.title}</div>
              {t.description && (
                <div className="text-xs text-slate-400 mt-0.5 break-words">
                  {t.description}
                </div>
              )}
              {t.txHash && (
                <a
                  href={`${EXPLORER}/tx/${t.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-1.5 text-xs text-fuchsia-400 hover:text-fuchsia-300"
                >
                  View on Stellar Expert <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-500 hover:text-slate-200 text-lg leading-none px-1"
              aria-label="dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}
