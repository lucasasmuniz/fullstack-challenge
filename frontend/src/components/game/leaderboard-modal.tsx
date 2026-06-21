"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useLeaderboard, type LeaderboardPeriod } from "@/hooks/use-leaderboard";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useUiStore } from "@/stores/ui-store";
import { cn, formatBRL } from "@/lib/utils";

function profit(cents: number): { text: string; cls: string } {
  const sign = cents >= 0 ? "+" : "−";
  return {
    text: `${sign}${formatBRL(Math.abs(cents))}`,
    cls: cents >= 0 ? "text-primary" : "text-danger",
  };
}

/** Top jogadores por lucro líquido (24h/semana). Destaca o jogador logado. */
export function LeaderboardModal() {
  const close = useUiStore((s) => s.close);
  const { username } = useCurrentUser();
  const [period, setPeriod] = useState<LeaderboardPeriod>("24h");
  const { data, isLoading } = useLeaderboard(period);
  const items = data?.items ?? [];

  return (
    <Modal title="Leaderboard" subtitle="Top por lucro líquido" icon={Trophy} onClose={close} maxWidth="max-w-xl">
      <div className="flex flex-col gap-4 p-6">
        <Segmented
          options={[
            { value: "24h", label: "24 horas" },
            { value: "week", label: "Semana" },
          ]}
          value={period}
          onChange={setPeriod}
        />

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Sem dados nesta janela ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((entry) => {
              const p = profit(entry.profitCents);
              const me = entry.username === username;
              return (
                <li
                  key={entry.username}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3",
                    me ? "border-primary-deep bg-primary/[0.07]" : "border-line bg-surface",
                  )}
                >
                  <span className="w-6 text-center font-mono text-sm font-semibold text-faint">
                    {entry.rank}
                  </span>
                  <Avatar name={entry.username} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {entry.username}
                      {me && <span className="ml-1.5 text-xs text-primary">(você)</span>}
                    </div>
                    <div className="font-mono text-[11px] text-faint">
                      {entry.betsCount} apostas
                    </div>
                  </div>
                  <span className={cn("font-mono text-sm font-bold", p.cls)}>{p.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
