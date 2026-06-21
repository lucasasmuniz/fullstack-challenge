import {
  Loader2,
  Check,
  X,
  TrendingUp,
  RotateCcw,
  MinusCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BetStatusWire } from "@crash-game/realtime-contracts";
import { cn, formatMultiplier } from "@/lib/utils";

/** Status de aposta no fio (contrato compartilhado) + SKIPPED_ROUND (auto-bet, não trafega no WS). */
export type BetStatus = BetStatusWire | "SKIPPED_ROUND";

interface StatusMeta {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly className: string;
  readonly pulse?: boolean;
  readonly dashed?: boolean;
}

const META: Record<BetStatus, StatusMeta> = {
  PENDING_FUNDS: {
    label: "Pendente",
    icon: Loader2,
    className: "text-muted border-line bg-elevated/50",
    pulse: true,
  },
  CONFIRMED: {
    label: "Confirmada",
    icon: Check,
    className: "text-primary border-primary/25 bg-primary/10",
  },
  REJECTED: {
    label: "Rejeitada",
    icon: X,
    className: "text-danger border-danger/25 bg-danger/10",
  },
  CASHED_OUT: {
    label: "Sacou",
    icon: TrendingUp,
    className: "text-ink border-primary bg-primary shadow-glow",
  },
  LOST: {
    label: "Perdeu",
    icon: X,
    className: "text-danger/70 border-danger/15 bg-danger/[0.06]",
  },
  REFUNDED: {
    label: "Reembolso",
    icon: RotateCcw,
    className: "text-muted border-line bg-elevated/50",
  },
  SKIPPED_ROUND: {
    label: "Pulou",
    icon: MinusCircle,
    className: "text-faint border-line bg-transparent",
    dashed: true,
  },
};

/** Badge do status da aposta. CASHED_OUT mostra o multiplicador do saque quando disponível. */
export function StatusBadge({
  status,
  cashoutMultiplierX100,
  className,
}: {
  status: BetStatus;
  cashoutMultiplierX100?: number | null;
  className?: string;
}) {
  const meta = META[status];
  const Icon = meta.icon;
  const showMult =
    status === "CASHED_OUT" &&
    cashoutMultiplierX100 != null &&
    cashoutMultiplierX100 > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-semibold",
        meta.dashed && "border-dashed",
        meta.className,
        className,
      )}
    >
      <Icon className={cn("size-3", meta.pulse && "animate-spin")} />
      {meta.label}
      {showMult && <span>{formatMultiplier(cashoutMultiplierX100)}</span>}
    </span>
  );
}
