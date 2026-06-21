"use client";

import { History, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBetHistory } from "@/hooks/use-bet-history";
import { useUiStore } from "@/stores/ui-store";
import { formatBRL, formatMultiplier } from "@/lib/utils";

/** Histórico paginado das apostas do jogador. */
export function HistoryModal() {
  const close = useUiStore((s) => s.close);
  const { data, isLoading } = useBetHistory();
  const items = data?.items ?? [];

  return (
    <Modal title="Minhas apostas" subtitle="Histórico recente" icon={History} onClose={close} maxWidth="max-w-2xl">
      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 pb-2 text-[10.5px] uppercase tracking-wide text-faint">
          <span>Aposta</span>
          <span className="text-right">Saída</span>
          <span className="text-right">Resultado</span>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 px-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Search className="size-6 text-faint" />
            <span className="text-sm text-muted">Sem apostas ainda</span>
            <span className="text-xs text-faint">Suas apostas aparecem aqui</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((bet) => {
              const won = bet.payoutCents != null && bet.payoutCents > 0;
              return (
                <li
                  key={bet.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg bg-surface px-4 py-3"
                >
                  <div>
                    <div className="font-mono text-sm font-semibold">
                      {formatBRL(bet.amountCents)}
                    </div>
                    <StatusBadge
                      status={bet.status}
                      cashoutMultiplierX100={bet.cashoutMultiplierX100}
                      className="mt-1"
                    />
                  </div>
                  <span className="text-right font-mono text-sm text-muted">
                    {bet.cashoutMultiplierX100
                      ? formatMultiplier(bet.cashoutMultiplierX100)
                      : "—"}
                  </span>
                  <span
                    className={`text-right font-mono text-sm font-semibold ${won ? "text-primary" : "text-faint"}`}
                  >
                    {won ? `+${formatBRL(bet.payoutCents!)}` : `−${formatBRL(bet.amountCents)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
