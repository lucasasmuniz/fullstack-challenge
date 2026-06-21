"use client";

import { useEffect, useState } from "react";
import { elapsedForMultiplier } from "@crash-game/curve";
import { ShieldCheck, Copy } from "lucide-react";
import { useGameStore } from "@/stores/game-store";
import { useUiStore } from "@/stores/ui-store";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { cn, formatMultiplier } from "@/lib/utils";

const RING_R = 52;
const RING_CIRC = 2 * Math.PI * RING_R;

const SAMPLES = 64;
// Margens do plot (em % do viewBox 0..100).
const LEFT = 4;
const RIGHT = 8;
const TOP = 12;
const BOTTOM = 10;
const BASE_Y = 100 - BOTTOM;
// Eixos saturantes ("zoom infinito"): a cabeça viaja do canto inferior-esquerdo e nunca sai do
// frame; o formato exponencial real fica preservado (rente ao chão no início, subindo aos poucos).
const TX_MS = 5000; // escala do tempo: t/(t+TX)
const MY_X100 = 350; // escala do multiplicador: (m-100)/((m-100)+MY)

function curveValue(elapsedMs: number, growthRate: number): number {
  return 100 * Math.exp((growthRate * elapsedMs) / 1000);
}
const fx = (t: number) => LEFT + (t / (t + TX_MS)) * (100 - LEFT - RIGHT);
const fy = (m: number) =>
  BASE_Y - ((m - 100) / (m - 100 + MY_X100)) * (100 - TOP - BOTTOM);

interface Curve {
  line: string;
  area: string;
  headX: number;
  headY: number;
}

function buildCurve(currentX100: number, growthRate: number): Curve | null {
  if (currentX100 <= 100 || growthRate <= 0) return null;
  const elapsed = elapsedForMultiplier(currentX100, growthRate);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i / SAMPLES) * elapsed;
    pts.push([fx(t), fy(curveValue(t, growthRate))]);
  }
  const line = `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")}`;
  const [hx, hy] = pts[pts.length - 1];
  const area = `${line} L ${hx.toFixed(2)} ${BASE_Y} L ${LEFT} ${BASE_Y} Z`;
  return { line, area, headX: hx, headY: hy };
}

/** Countdown da janela de apostas + fração restante (para o anel). */
function useCountdown(targetIso: string | undefined): { secs: number; progress: number } {
  const [state, setState] = useState({ secs: 0, progress: 0 });
  useEffect(() => {
    if (!targetIso) return;
    const total = Math.max(1, Math.ceil((Date.parse(targetIso) - Date.now()) / 1000));
    const tick = () => {
      const secs = Math.max(0, Math.ceil((Date.parse(targetIso) - Date.now()) / 1000));
      setState({ secs, progress: secs / total });
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [targetIso]);
  return state;
}

/** Painel central: número gigante + curva exponencial. Estados BETTING/RUNNING/CRASHED. */
export function CrashChart() {
  const phase = useGameStore((s) => s.phase);
  const round = useGameStore((s) => s.round);
  const crash = useGameStore((s) => s.crash);
  const liveX100 = useGameStore((s) => s.liveMultiplierX100);
  const conn = useGameStore((s) => s.conn);
  const latencyMs = useGameStore((s) => s.latencyMs);
  const openModal = useUiStore((s) => s.open);
  const { secs, progress } = useCountdown(
    phase === "BETTING" ? round?.bettingEndsAt : undefined,
  );

  const betting = phase === "BETTING";
  const crashed = phase === "CRASHED" || phase === "SETTLED";
  const displayX100 = crashed && crash ? crash.crashPointX100 : liveX100;
  const growthRate = round?.growthRate ?? 0.06;
  const curve = betting ? null : buildCurve(displayX100, growthRate);
  const color = crashed ? "#FF4D4D" : "#7CFC4A";

  const copyHash = () => {
    if (round?.serverSeedHash) void navigator.clipboard.writeText(round.serverSeedHash);
  };

  return (
    <div
      className={cn(
        "relative size-full min-h-[380px] overflow-hidden rounded-xl border bg-surface",
        crashed ? "border-danger/40" : "border-line",
      )}
    >
      {curve && (
        <>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
            <defs>
              <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={curve.area} fill="url(#curveFill)" stroke="none" />
            <path
              d={curve.line}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            className={cn(
              "absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full",
              crashed ? "bg-danger" : "bg-primary shadow-glow",
            )}
            style={{ left: `${curve.headX}%`, top: `${curve.headY}%` }}
          />
        </>
      )}
      {crashed && crash && (
        <span
          key={crash.serverSeed}
          className="pointer-events-none absolute inset-0 bg-danger opacity-0 animate-[crashFlash_0.45s_ease-out]"
        />
      )}

      {betting ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5">
          <span className="text-xs uppercase tracking-[0.18em] text-muted">
            Apostas fecham em
          </span>
          <div className="relative size-[120px]">
            <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
              <circle cx="60" cy="60" r={RING_R} fill="none" stroke="#1E2421" strokeWidth="8" />
              <circle
                cx="60"
                cy="60"
                r={RING_R}
                fill="none"
                stroke={secs <= 3 ? "#FFC24D" : "#7CFC4A"}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={RING_CIRC * (1 - progress)}
                className="transition-[stroke-dashoffset] duration-200"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center font-mono text-4xl font-bold">
              {secs}
            </div>
          </div>
          {round?.serverSeedHash && (
            <button
              onClick={copyHash}
              title="Copiar hash da seed (provably fair)"
              className="flex items-center gap-2 rounded-lg border border-line bg-base/60 px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:text-fg"
            >
              <ShieldCheck className="size-3.5 text-primary" />
              seed hash {round.serverSeedHash.slice(0, 8)}…
              <Copy className="size-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-[40%] z-10 flex flex-col items-center gap-2 text-center">
          <span
            className={cn(
              "tabular text-7xl font-bold tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)] transition-colors sm:text-8xl",
              crashed
                ? "text-danger animate-[crashShake_0.4s_ease-in-out]"
                : displayX100 >= 200
                  ? "text-primary"
                  : "text-fg",
            )}
          >
            {formatMultiplier(displayX100)}
          </span>
          <span
            className={cn(
              "text-sm uppercase tracking-[0.16em]",
              crashed ? "text-danger" : "text-muted",
            )}
          >
            {crashed ? "Crashou" : "Subindo"}
          </span>
          {crashed && round && (
            <button
              onClick={() => openModal({ type: "verify", roundId: round.id })}
              className="pointer-events-auto mt-1 text-xs text-muted underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Verificar →
            </button>
          )}
        </div>
      )}

      <ConnectionStatus
        state={conn}
        latencyMs={latencyMs}
        className="absolute bottom-3 right-4 z-10"
      />
    </div>
  );
}
