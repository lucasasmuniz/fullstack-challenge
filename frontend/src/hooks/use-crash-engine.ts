"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/game-store";

const THROTTLE_MS = 33; // ~30fps: fluido desde o início, sem re-render a 60fps

/** Valor contínuo (float ×100) da curva — display suave (não-autoritativo, ADR 0016). */
function curveValueX100(elapsedMs: number, growthRate: number): number {
  return 100 * Math.exp((growthRate * elapsedMs) / 1000);
}

/**
 * Dead reckoning do multiplicador (ADR 0016): a autoridade é o `elapsedMs` do último tick; entre
 * ticks extrapolamos com o relógio local e a curva. Escreve o valor **contínuo** em
 * `liveMultiplierX100` (não floor → sobe suave acelerando, sem saltos no início). Só em RUNNING;
 * `round:crashed` é o override absoluto.
 */
export function useCrashEngine() {
  useEffect(() => {
    let raf = 0;
    let lastWrite = 0;

    const loop = () => {
      const { phase, round, tick, setLiveMultiplier } = useGameStore.getState();
      if (phase === "RUNNING" && round?.startedAt && tick) {
        const elapsed = tick.elapsedMs + (Date.now() - tick.atClientMs);
        const now = performance.now();
        if (now - lastWrite >= THROTTLE_MS) {
          lastWrite = now;
          setLiveMultiplier(curveValueX100(elapsed, round.growthRate));
        }
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
