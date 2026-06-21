"use client";

import { Loader2 } from "lucide-react";
import type { RoundPhase } from "@/stores/game-store";
import type { BetStatus } from "@/components/ui/status-badge";
import { cn, formatBRL, formatMultiplier } from "@/lib/utils";

interface Props {
  isAuthenticated: boolean;
  phase: RoundPhase;
  status: BetStatus | null;
  amountCents: number;
  payoutCents: number;
  multiplierX100: number;
  overBalance: boolean;
  pending: boolean;
  onPlace: () => void;
  onCashout: () => void;
  onLogin: () => void;
  onRegister: () => void;
}

const XL =
  "flex h-16 w-full flex-col items-center justify-center rounded-xl font-display transition-colors disabled:cursor-not-allowed";

/** BetButton XL: o estado deriva de auth + fase + status da aposta (server-authoritative). */
export function BetButton(p: Props) {
  if (!p.isAuthenticated) {
    return (
      <div className="flex flex-col gap-2">
        <button onClick={p.onLogin} className={cn(XL, "bg-primary text-base shadow-glow hover:bg-primary-glow")}>
          <span className="text-[17px] font-bold">Entrar para apostar</span>
        </button>
        <button
          onClick={p.onRegister}
          className="text-center text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Não tem conta? Criar conta
        </button>
      </div>
    );
  }

  // Aposta resolvida sem efeito na rodada atual → pode reapostar enquanto a janela está aberta.
  const fresh = p.status === null || p.status === "REJECTED" || p.status === "REFUNDED";

  if (p.pending || p.status === "PENDING_FUNDS") {
    return (
      <button disabled className={cn(XL, "gap-2 bg-primary-deep text-fg")}>
        <span className="flex items-center gap-2 text-base font-semibold">
          <Loader2 className="size-4 animate-spin" /> Confirmando…
        </span>
      </button>
    );
  }

  if (p.status === "CONFIRMED" && p.phase === "RUNNING") {
    return (
      <button
        onClick={p.onCashout}
        className={cn(XL, "bg-primary text-base shadow-[0_0_30px_rgba(124,252,74,.55)] hover:bg-primary-glow")}
      >
        <span className="text-[17px] font-bold">Sacar {formatBRL(p.payoutCents)}</span>
        <span className="font-mono text-[13px] opacity-85">@ {formatMultiplier(p.multiplierX100)}</span>
      </button>
    );
  }

  if (p.status === "CONFIRMED") {
    return (
      <button disabled className={cn(XL, "border border-primary/30 bg-primary/10 text-primary")}>
        <span className="text-base font-semibold">Aposta confirmada</span>
        <span className="text-[12px] opacity-80">aguarde a rodada iniciar</span>
      </button>
    );
  }

  if (p.status === "CASHED_OUT") {
    return (
      <button disabled className={cn(XL, "bg-primary/15 text-primary")}>
        <span className="text-base font-semibold">Você sacou ✓</span>
      </button>
    );
  }

  if (p.status === "LOST") {
    return (
      <button disabled className={cn(XL, "border border-line bg-base/60 text-danger/70")}>
        <span className="text-base font-semibold">Não sacou a tempo</span>
      </button>
    );
  }

  if (fresh && p.phase === "BETTING") {
    return (
      <button
        onClick={p.onPlace}
        disabled={p.overBalance}
        className={cn(
          XL,
          p.overBalance
            ? "border border-line bg-base/60 text-faint"
            : "bg-primary text-base shadow-glow hover:bg-primary-glow",
        )}
      >
        <span className="text-[17px] font-bold">
          {p.overBalance ? "Saldo insuficiente" : "Apostar"}
        </span>
        {!p.overBalance && (
          <span className="font-mono text-[13px] opacity-80">{formatBRL(p.amountCents)}</span>
        )}
      </button>
    );
  }

  const reason = p.phase === "RUNNING" ? "rodada em andamento" : "aguarde a próxima rodada";
  return (
    <button disabled className={cn(XL, "border border-line bg-base/60 text-faint")}>
      <span className="text-base font-semibold">Aguarde</span>
      <span className="text-[12px]">{reason}</span>
    </button>
  );
}
