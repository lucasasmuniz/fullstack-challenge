"use client";

import { useEffect } from "react";
import { useGameSocket } from "@/hooks/use-game-socket";
import { useCrashEngine } from "@/hooks/use-crash-engine";
import { useGameSounds } from "@/hooks/use-game-sounds";
import { useCurrentRound, useRoundHistory } from "@/hooks/use-rounds";
import { useGameStore } from "@/stores/game-store";
import { CrashChart } from "@/components/game/crash-chart";
import { HistoryStrip } from "@/components/game/history-strip";
import { LiveBets } from "@/components/game/live-bets";
import { BetPanel } from "@/components/game/bet-panel";

/**
 * Tela do jogo. WS + dead reckoning ativos aqui; REST semeia o estado inicial (rodada + histórico)
 * antes do 1º evento. Duas colunas no desktop (curva ampla | painel de aposta + apostas da rodada);
 * empilha no mobile.
 */
export default function GamePage() {
  useGameSocket();
  useCrashEngine();
  useGameSounds();

  const { data: current } = useCurrentRound();
  const { data: history } = useRoundHistory();
  const seedFromCurrent = useGameStore((s) => s.seedFromCurrent);
  const seedHistory = useGameStore((s) => s.seedHistory);

  useEffect(() => {
    if (current !== undefined) {
      seedFromCurrent(
        current
          ? {
              id: current.id,
              roundNumber: current.roundNumber,
              serverSeedHash: current.serverSeedHash,
              publicSeed: current.publicSeed,
              bettingEndsAt: current.bettingEndsAt,
              startedAt: current.startedAt,
              growthRate: current.growthRate,
            }
          : null,
        current?.status ?? "IDLE",
      );
    }
  }, [current, seedFromCurrent]);

  useEffect(() => {
    if (history) seedHistory(history.items.map((r) => r.crashPointX100));
  }, [history, seedHistory]);

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-4 md:px-6">
      {/* Duas colunas: curva ampla à esquerda (com o strip de histórico só sobre ela); à direita
          empilha Aposta (topo) + Apostas da rodada (embaixo). */}
      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-120px)] lg:grid-cols-[1fr_380px]">
        <div className="order-1 flex min-h-[440px] min-w-0 flex-col gap-3 lg:h-full">
          <HistoryStrip />
          <div className="min-h-0 flex-1">
            <CrashChart />
          </div>
        </div>
        <div className="order-2 flex min-h-0 flex-col gap-4 lg:h-full">
          <BetPanel />
          <div className="min-h-0 flex-1">
            <LiveBets />
          </div>
        </div>
      </div>
    </main>
  );
}
