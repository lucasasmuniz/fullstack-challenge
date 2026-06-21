"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import {
  useAutoBet,
  type AutoBetStrategy,
  type AutoBetConfig,
} from "@/hooks/use-auto-bet";
import { useWallet } from "@/hooks/use-wallet";
import { useGameStore } from "@/stores/game-store";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn, formatBRL, formatMultiplier } from "@/lib/utils";

const STRATEGY_INFO: Record<AutoBetStrategy, string> = {
  FIXED: "Aposta sempre o mesmo valor a cada rodada, sacando no alvo definido.",
  MARTINGALE:
    "Dobra a aposta a cada perda e volta à base ao ganhar — recupera as perdas, mas consome o saldo rápido.",
};

const REASON_LABEL: Record<string, string> = {
  STOP_LOSS: "Stop-loss atingido",
  STOP_WIN: "Stop-win atingido",
  MAX_ROUNDS: "Limite de rodadas",
  BUDGET_EXCEEDED: "Orçamento esgotado",
  MAX_BET_EXCEEDED: "Aposta máxima excedida",
  MANUAL: "Parado manualmente",
};

/** Aba Auto Bet (dentro do painel inline): config (FIXED/Martingale + freios) → estado RODANDO. */
export function AutoBetTab() {
  const { session, start, stop } = useAutoBet(true);
  const { data: wallet } = useWallet();
  const balance = wallet?.balanceCents ?? 0;

  const [strategy, setStrategy] = useState<AutoBetStrategy>("FIXED");
  const [base, setBase] = useState(2_000);
  const [targetX100, setTargetX100] = useState(200);
  // Stop-loss e orçamento default = saldo da carteira (enquanto null, segue o saldo reativo).
  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const effStopLoss = stopLoss ?? balance;
  const effBudget = budget ?? balance;

  // Ganho potencial da rodada em curso: minha aposta CONFIRMED × multiplicador atual (só em RUNNING).
  const phase = useGameStore((s) => s.phase);
  const liveX100 = useGameStore((s) => s.liveMultiplierX100);
  const liveBets = useGameStore((s) => s.liveBets);
  const { username } = useCurrentUser();
  const potential = useMemo(() => {
    if (phase !== "RUNNING") return null;
    const bet = liveBets.find((b) => b.username === username && b.status === "CONFIRMED");
    if (!bet) return null;
    return { cents: Math.floor((bet.amountCents * liveX100) / 100), x100: liveX100 };
  }, [phase, liveBets, username, liveX100]);

  const active = session?.status === "ACTIVE";

  if (active) {
    const profit = session.netResultCents;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-xl border border-primary-deep bg-primary/[0.06] px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="size-2 animate-[pulseDot_1.4s_infinite] rounded-full bg-primary" />
            Auto Bet ativo · {session.strategy === "FIXED" ? "Fixo" : "Martingale"}
          </span>
        </div>

        {potential !== null && (
          <div className="flex items-center justify-between rounded-xl border border-primary-deep bg-primary/10 px-4 py-3 shadow-glow">
            <span className="text-xs uppercase tracking-wide text-muted">Ganhando agora</span>
            <span className="font-mono text-lg font-bold text-primary">
              {formatBRL(potential.cents)} <span className="text-xs opacity-80">@ {formatMultiplier(potential.x100)}</span>
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Resultado" value={`${profit >= 0 ? "+" : "−"}${formatBRL(Math.abs(profit))}`} cls={profit >= 0 ? "text-primary" : "text-danger"} />
          <Stat label="Rodadas" value={String(session.roundsPlayed)} />
          <Stat label="Próxima aposta" value={formatBRL(session.nextAmountCents)} />
          <Stat label="Apostado" value={formatBRL(session.totalWageredCents)} />
        </div>

        <Button variant="danger" size="lg" loading={stop.isPending} onClick={() => stop.mutate()} className="w-full">
          Parar Auto Bet
        </Button>
      </div>
    );
  }

  const submit = () => {
    const cfg: AutoBetConfig = {
      strategy,
      baseAmountCents: base,
      autoCashoutTargetX100: targetX100,
      stopLossCents: effStopLoss,
      budgetCents: effBudget,
    };
    start.mutate(cfg);
  };

  return (
    <div className="flex flex-col gap-4">
      {session && (
        <div className="rounded-xl border border-line bg-base/60 px-4 py-3 text-sm">
          <span className="text-muted">Última sessão: </span>
          <span className={session.netResultCents >= 0 ? "text-primary" : "text-danger"}>
            {session.netResultCents >= 0 ? "+" : "−"}
            {formatBRL(Math.abs(session.netResultCents))}
          </span>
          <span className="text-faint">
            {" "}· {REASON_LABEL[session.completionReason ?? ""] ?? "encerrada"}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Estratégia</span>
        <Segmented
          options={[
            { value: "FIXED", label: "Valor fixo" },
            { value: "MARTINGALE", label: "Martingale" },
          ]}
          value={strategy}
          onChange={setStrategy}
          className="w-full [&>button]:flex-1"
        />
        <div className="flex items-start gap-2 rounded-lg border border-line bg-base/60 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>{STRATEGY_INFO[strategy]}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Aposta base">
          <NumberInput valueCents={base} onChange={setBase} min={100} max={Math.min(100_000, balance || 100_000)} step={500} />
        </Field>
        <Field label="Cashout alvo">
          <TargetInput value={targetX100} onChange={setTargetX100} />
        </Field>
        <Field label="Stop-loss">
          <NumberInput valueCents={effStopLoss} onChange={setStopLoss} min={100} max={balance || undefined} step={1_000} />
        </Field>
        <Field label="Orçamento">
          <NumberInput valueCents={effBudget} onChange={setBudget} min={100} max={balance || undefined} step={1_000} />
        </Field>
      </div>

      <p className="rounded-lg border border-line bg-base/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
        Aposta {formatBRL(base)}, saca em {(targetX100 / 100).toFixed(2)}x. Para ao perder{" "}
        {formatBRL(effStopLoss)} ou gastar {formatBRL(effBudget)}.
      </p>

      <Button size="lg" loading={start.isPending} onClick={submit} className="w-full">
        Iniciar Auto Bet
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border border-line bg-base/60 px-3 py-2.5">
      <div className={cn("font-mono text-base font-bold", cls ?? "text-fg")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/** Input do multiplicador alvo (×100), edição livre. */
function TargetInput({ value, onChange }: { value: number; onChange: (x100: number) => void }) {
  return (
    <div className="flex h-[46px] items-center rounded-[10px] border border-line bg-base/60 px-3">
      <input
        inputMode="decimal"
        defaultValue={(value / 100).toFixed(2)}
        onChange={(e) => {
          const v = parseFloat(e.target.value.replace(",", "."));
          if (Number.isFinite(v) && v > 1) onChange(Math.round(v * 100));
        }}
        className="w-full bg-transparent font-mono text-base font-semibold text-fg outline-none placeholder:text-faint"
      />
      <span className="font-mono text-muted">x</span>
    </div>
  );
}
