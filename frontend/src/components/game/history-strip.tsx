"use client";

import { useGameStore } from "@/stores/game-store";
import { MultiplierPill } from "@/components/ui/multiplier-pill";

/** Strip das últimas rodadas: label "Últimas" fixa + pílulas com scroll horizontal próprio. */
export function HistoryStrip() {
  const history = useGameStore((s) => s.history);

  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-faint">
        Últimas
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
        {history.length === 0 ? (
          <span className="text-xs text-faint">—</span>
        ) : (
          history.map((x100, i) => (
            <MultiplierPill key={`${x100}-${i}`} x100={x100} className="shrink-0" />
          ))
        )}
      </div>
    </div>
  );
}
