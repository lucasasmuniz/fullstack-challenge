"use client";

import type { ReactNode } from "react";
import { ShieldCheck, Check, X, Copy } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useVerify } from "@/hooks/use-verify";
import { useUiStore } from "@/stores/ui-store";
import { cn, formatMultiplier } from "@/lib/utils";

function SeedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-faint">{label}</span>
      <button
        onClick={() => void navigator.clipboard.writeText(value)}
        title="Copiar"
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left font-mono text-xs text-muted transition-colors hover:text-fg"
      >
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <Copy className="size-3.5 shrink-0" />
      </button>
    </div>
  );
}

function CheckLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn("grid size-5 place-items-center rounded-full", ok ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger")}>
        {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      </span>
      <span className={ok ? "text-fg" : "text-danger"}>{children}</span>
    </div>
  );
}

/** Verificação provably-fair de uma rodada: commitment, crash recalculado e elo da hash chain. */
export function VerifyModal({ roundId }: { roundId: string }) {
  const close = useUiStore((s) => s.close);
  const { data, isLoading, isError } = useVerify(roundId);

  return (
    <Modal
      title="Verificar rodada"
      subtitle={data ? `Rodada #${data.roundNumber}` : "Provably fair"}
      icon={ShieldCheck}
      onClose={close}
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-4 p-6">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : isError || !data ? (
          <p className="py-6 text-center text-sm text-danger">
            Não foi possível carregar a verificação.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
              <CheckLine ok={data.verification.commitmentOk}>
                Commitment do hash confere
              </CheckLine>
              <CheckLine ok={data.verification.crashPointOk}>
                Crash recalculado: {formatMultiplier(data.verification.recomputedCrashPointX100)}
              </CheckLine>
              {data.chainLink && (
                <CheckLine ok={data.chainLink.ok}>
                  {data.chainLink.crossChainBoundary
                    ? "Início de nova cadeia (rotação)"
                    : "Elo da hash chain confere"}
                </CheckLine>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
              <span className="text-sm text-muted">Crash point</span>
              <span className="font-mono text-lg font-bold text-primary">
                {formatMultiplier(data.crashPointX100)}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <SeedRow label="Server seed (revelada)" value={data.serverSeed} />
              <SeedRow label="Server seed hash (commit)" value={data.serverSeedHash} />
              <SeedRow label="Public seed" value={data.publicSeed} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
