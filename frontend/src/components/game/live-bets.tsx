"use client";

import { useGameStore } from "@/stores/game-store";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBRL } from "@/lib/utils";

/** Lista de apostas da rodada em tempo real (alimentada pelos eventos bet:placed/bet:updated). */
export function LiveBets() {
  const bets = useGameStore((s) => s.liveBets);
  const total = bets.reduce((sum, b) => sum + b.amountCents, 0);

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-display text-sm font-semibold">Apostas da rodada</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-primary">
          <span className="size-1.5 animate-[pulseDot_1.6s_infinite] rounded-full bg-primary" />
          ao vivo
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
        <div className="bg-surface px-4 py-3">
          <div className="font-mono text-lg font-bold">{bets.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-faint">
            Jogadores
          </div>
        </div>
        <div className="bg-surface px-4 py-3">
          <div className="font-mono text-lg font-bold text-primary">
            {formatBRL(total)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-faint">
            Apostado
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {bets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
            <span className="text-sm text-muted">Seja o primeiro a apostar</span>
            <span className="text-xs text-faint">As apostas aparecem aqui ao vivo</span>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {bets.map((bet) => (
              <li key={bet.betId} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={bet.username} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{bet.username}</div>
                  <div className="font-mono text-xs text-muted">
                    {formatBRL(bet.amountCents)}
                  </div>
                </div>
                <StatusBadge
                  status={bet.status}
                  cashoutMultiplierX100={bet.cashoutMultiplierX100}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
