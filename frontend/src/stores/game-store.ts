import { create } from "zustand";
import type {
  RoundOpenedPayload,
  RoundStartedPayload,
  RoundTickPayload,
  RoundCrashedPayload,
  BetPlacedPayload,
  BetUpdatedPayload,
} from "@crash-game/realtime-contracts";
import type { ConnState } from "@/components/ui/connection-status";
import type { BetStatus } from "@/components/ui/status-badge";

export type RoundPhase = "IDLE" | "BETTING" | "RUNNING" | "CRASHED" | "SETTLED";

export interface LiveBet {
  readonly betId: string;
  readonly username: string;
  readonly amountCents: number;
  status: BetStatus;
  cashoutMultiplierX100: number | null;
  payoutCents: number | null;
}

/** Âncora de dead reckoning: o último tick autoritativo + quando ele chegou (relógio local). */
interface TickAnchor {
  readonly elapsedMs: number;
  readonly atClientMs: number;
}

export interface RoundInfo {
  readonly id: string;
  readonly roundNumber: number;
  readonly serverSeedHash: string;
  readonly publicSeed: string;
  readonly bettingEndsAt: string;
  readonly startedAt: string | null;
  readonly growthRate: number;
}

interface GameState {
  phase: RoundPhase;
  round: RoundInfo | null;
  crash: { crashPointX100: number; serverSeed: string } | null;
  tick: TickAnchor | null;
  /** Multiplicador exibido (float ×100), atualizado pelo motor de animação em ~30fps (não-autoritativo). */
  liveMultiplierX100: number;
  liveBets: LiveBet[];
  /** Crash points (×100) das últimas rodadas, mais recente primeiro. */
  history: number[];
  conn: ConnState;
  latencyMs?: number;

  seedFromCurrent: (round: RoundInfo | null, phase: RoundPhase) => void;
  seedHistory: (crashPointsX100: number[]) => void;
  onRoundOpened: (p: RoundOpenedPayload) => void;
  onRoundStarted: (p: RoundStartedPayload) => void;
  onTick: (p: RoundTickPayload) => void;
  onCrashed: (p: RoundCrashedPayload) => void;
  onSettled: () => void;
  onBetPlaced: (p: BetPlacedPayload) => void;
  onBetUpdated: (p: BetUpdatedPayload) => void;
  setLiveMultiplier: (x100: number) => void;
  setConn: (conn: ConnState, latencyMs?: number) => void;
}

const MIN_X100 = 100;

export const useGameStore = create<GameState>((set) => ({
  phase: "IDLE",
  round: null,
  crash: null,
  tick: null,
  liveMultiplierX100: MIN_X100,
  liveBets: [],
  history: [],
  conn: "reconnecting",

  seedFromCurrent: (round, phase) =>
    set({
      round,
      phase,
      crash: null,
      // Carregou no meio de uma rodada: ancora o tick por startedAt até o 1º tick do WS chegar.
      tick:
        phase === "RUNNING" && round?.startedAt
          ? {
              elapsedMs: Math.max(0, Date.now() - Date.parse(round.startedAt)),
              atClientMs: Date.now(),
            }
          : null,
      liveMultiplierX100: MIN_X100,
    }),

  seedHistory: (crashPointsX100) => set({ history: crashPointsX100 }),

  onRoundOpened: (p) =>
    set({
      phase: "BETTING",
      round: {
        id: p.roundId,
        roundNumber: p.roundNumber,
        serverSeedHash: p.serverSeedHash,
        publicSeed: p.publicSeed,
        bettingEndsAt: p.bettingEndsAt,
        startedAt: null,
        growthRate: 0,
      },
      crash: null,
      tick: null,
      liveMultiplierX100: MIN_X100,
      liveBets: [],
    }),

  onRoundStarted: (p) =>
    set((s) => ({
      phase: "RUNNING",
      round: s.round
        ? { ...s.round, startedAt: p.startedAt, growthRate: p.growthRate }
        : s.round,
      tick: { elapsedMs: 0, atClientMs: Date.now() },
    })),

  onTick: (p) => set({ tick: { elapsedMs: p.elapsedMs, atClientMs: Date.now() } }),

  onCrashed: (p) =>
    set({
      phase: "CRASHED",
      crash: { crashPointX100: p.crashPointX100, serverSeed: p.serverSeed },
      liveMultiplierX100: p.crashPointX100,
    }),

  onSettled: () =>
    set((s) => ({
      phase: "SETTLED",
      history: s.crash
        ? [s.crash.crashPointX100, ...s.history].slice(0, 24)
        : s.history,
    })),

  onBetPlaced: (p) =>
    set((s) =>
      s.liveBets.some((b) => b.betId === p.betId)
        ? s
        : {
            liveBets: [
              {
                betId: p.betId,
                username: p.username,
                amountCents: p.amountCents,
                status: p.status as BetStatus,
                cashoutMultiplierX100: null,
                payoutCents: null,
              },
              ...s.liveBets,
            ],
          },
    ),

  onBetUpdated: (p) =>
    set((s) => ({
      liveBets: s.liveBets.map((b) =>
        b.betId === p.betId
          ? {
              ...b,
              status: p.status as BetStatus,
              cashoutMultiplierX100: p.cashoutMultiplierX100 ?? b.cashoutMultiplierX100,
              payoutCents: p.payoutCents ?? b.payoutCents,
            }
          : b,
      ),
    })),

  setLiveMultiplier: (x100) => set({ liveMultiplierX100: x100 }),
  setConn: (conn, latencyMs) => set({ conn, latencyMs }),
}));
