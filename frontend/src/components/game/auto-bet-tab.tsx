"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import {
  useAutoBet,
  type AutoBetStrategy,
  type AutoBetConfig,
} from "@/hooks/use-auto-bet";
import { cn, formatBRL } from "@/lib/utils";

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

  const [strategy, setStrategy] = useState<AutoBetStrategy>("FIXED");
  const [base, setBase] = useState(2_000);
  const [targetX100, setTargetX100] = useState(200);
  const [stopLoss, setStopLoss] = useState(10_000);
  const [budget, setBudget] = useState(50_000);

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
      stopLossCents: stopLoss,
      budgetCents: budget,
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Aposta base">
          <NumberInput valueCents={base} onChange={setBase} min={100} max={100_000} step={500} />
        </Field>
        <Field label="Cashout alvo">
          <TargetInput value={targetX100} onChange={setTargetX100} />
        </Field>
        <Field label="Stop-loss">
          <NumberInput valueCents={stopLoss} onChange={setStopLoss} min={100} step={1_000} />
        </Field>
        <Field label="Orçamento">
          <NumberInput valueCents={budget} onChange={setBudget} min={100} step={1_000} />
        </Field>
      </div>

      <p className="rounded-lg border border-line bg-base/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
        Aposta {formatBRL(base)}, saca em {(targetX100 / 100).toFixed(2)}x. Para ao perder{" "}
        {formatBRL(stopLoss)} ou gastar {formatBRL(budget)}.
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
      <div className={cn("font-mono text-base font-bold", cls)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
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
        className="w-full bg-transparent font-mono text-base font-semibold outline-none"
      />
      <span className="font-mono text-muted">x</span>
    </div>
  );
}
