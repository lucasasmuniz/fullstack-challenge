"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/stores/game-store";
import { usePrefsStore } from "@/stores/prefs-store";
import { useCurrentUser } from "@/hooks/use-current-user";
import { playBet, playCashout, playCrash, unlockAudio } from "@/lib/sound";

/**
 * Toca os efeitos sonoros nos eventos do jogo (crash global; aposta confirmada e cashout do próprio
 * jogador), respeitando as preferências (master + por evento). Detecta transições via refs — não
 * re-renderiza. O AudioContext é desbloqueado no 1º gesto do usuário (limitação do browser).
 */
export function useGameSounds() {
  const prefs = usePrefsStore();
  const { username } = useCurrentUser();
  const phase = useGameStore((s) => s.phase);
  const liveBets = useGameStore((s) => s.liveBets);

  const prevPhase = useRef(phase);
  const confirmed = useRef<Set<string>>(new Set());
  const cashed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (phase === "CRASHED" && prevPhase.current !== "CRASHED") {
      if (prefs.soundMaster && prefs.soundCrash) playCrash();
    }
    prevPhase.current = phase;
  }, [phase, prefs.soundMaster, prefs.soundCrash]);

  useEffect(() => {
    for (const bet of liveBets) {
      if (bet.username !== username) continue;
      if (bet.status === "CONFIRMED" && !confirmed.current.has(bet.betId)) {
        confirmed.current.add(bet.betId);
        if (prefs.soundMaster && prefs.soundBet) playBet();
      }
      if (bet.status === "CASHED_OUT" && !cashed.current.has(bet.betId)) {
        cashed.current.add(bet.betId);
        if (prefs.soundMaster && prefs.soundCashout) playCashout();
      }
    }
  }, [liveBets, username, prefs.soundMaster, prefs.soundBet, prefs.soundCashout]);
}
