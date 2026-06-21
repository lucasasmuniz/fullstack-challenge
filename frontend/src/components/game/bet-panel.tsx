"use client";

import { useMemo, useState } from "react";
import { useGameStore, type LiveBet } from "@/stores/game-store";
import { useWallet } from "@/hooks/use-wallet";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useBetActions } from "@/hooks/use-bet-actions";
import type { BetStatus } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/segmented";
import { NumberInput } from "@/components/ui/number-input";
import { Chip } from "@/components/ui/chip";
import { BetButton } from "./bet-button";
import { AutoBetTab } from "./auto-bet-tab";
import { AnonBetOverlay } from "./anon-bet-overlay";
import { cn, formatBRL } from "@/lib/utils";

const MIN_BET = 100;
const MAX_BET = 100_000;
const DEFAULT_BET = 2_000;
const QUICK = [500, 1_000, 5_000];

/** Painel inline (lateral desktop / inferior mobile). Tab Manual completa; Auto stub (F5). */
export function BetPanel() {
  const [tab, setTab] = useState<"manual" | "auto">("manual");
  const [amount, setAmount] = useState(DEFAULT_BET);
  const [autoTargetX100, setAutoTargetX100] = useState<number | null>(null);
  // Guarda a rodada da aposta: numa rodada nova o id deixa de casar e a aposta "expira" sem effect.
  const [myBet, setMyBet] = useState<{ roundId: string; betId: string } | null>(null);

  const phase = useGameStore((s) => s.phase);
  const roundId = useGameStore((s) => s.round?.id);
  const liveX100 = useGameStore((s) => s.liveMultiplierX100);
  const liveBets = useGameStore((s) => s.liveBets);

  const { isAuthenticated } = useCurrentUser();
  const { data: wallet } = useWallet(isAuthenticated);
  const { place, cashout, pending } = useBetActions();

  const myBetId = myBet && myBet.roundId === roundId ? myBet.betId : null;
  const liveMyBet: LiveBet | undefined = useMemo(
    () => (myBetId ? liveBets.find((b) => b.betId === myBetId) : undefined),
    [liveBets, myBetId],
  );
  // Otimista: assim que temos um betId nesta rodada, mostra PENDING até o WS trazer o status real.
  const myStatus: BetStatus | null =
    liveMyBet?.status ?? (myBetId ? "PENDING_FUNDS" : null);

  const balance = wallet?.balanceCents ?? 0;
  const overBalance = isAuthenticated && amount > balance;
  const payoutCents = Math.floor((amount * liveX100) / 100);

  const onPlace = async () => {
    const dto = await place(amount, autoTargetX100 ?? undefined);
    if (dto && roundId) setMyBet({ roundId, betId: dto.id });
  };

  return (
    <div className="relative shrink-0 rounded-xl border border-line bg-surface p-4">
      {!isAuthenticated && <AnonBetOverlay />}
      <div
        aria-hidden={!isAuthenticated}
        className={cn(
          "flex flex-col gap-4",
          !isAuthenticated && "pointer-events-none select-none blur-lg",
        )}
      >
        <Segmented
          options={[
            { value: "manual", label: "Aposta Manual" },
            { value: "auto", label: "Auto Bet" },
          ]}
          value={tab}
          onChange={setTab}
          className="w-full [&>button]:flex-1"
        />

        {tab === "manual" ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Valor da aposta</span>
            <span className="font-mono text-[11px] text-faint">mín R$ 1,00</span>
          </div>

          <NumberInput
            valueCents={amount}
            onChange={setAmount}
            min={MIN_BET}
            max={MAX_BET}
            step={500}
            disabled={!!myStatus && myStatus !== "REJECTED"}
            error={overBalance ? `Saldo insuficiente — ${formatBRL(balance)}` : undefined}
          />

          <div className="flex flex-wrap gap-2">
            {QUICK.map((c) => (
              <Chip key={c} onClick={() => setAmount((a) => Math.min(MAX_BET, a + c))}>
                +{c / 100}
              </Chip>
            ))}
            <Chip onClick={() => setAmount((a) => Math.max(MIN_BET, Math.floor(a / 2)))}>
              ½
            </Chip>
            {isAuthenticated && (
              <Chip onClick={() => setAmount(Math.min(MAX_BET, balance))}>Max</Chip>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">
              Auto-cashout <span className="text-faint">opcional</span>
            </span>
            <div className="flex h-[46px] items-center rounded-[10px] border border-line bg-base/60 px-3">
              <input
                inputMode="decimal"
                placeholder="2.00"
                disabled={!!myStatus}
                defaultValue={autoTargetX100 ? (autoTargetX100 / 100).toFixed(2) : ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value.replace(",", "."));
                  setAutoTargetX100(
                    Number.isFinite(v) && v > 1 ? Math.round(v * 100) : null,
                  );
                }}
                className="w-16 bg-transparent font-mono text-base outline-none"
              />
              <span className="font-mono text-muted">x</span>
              <span className="ml-auto text-xs text-faint">saca automaticamente</span>
            </div>
          </label>

          <BetButton
            isAuthenticated={isAuthenticated}
            phase={phase}
            status={myStatus}
            amountCents={amount}
            payoutCents={payoutCents}
            multiplierX100={liveX100}
            overBalance={overBalance}
            pending={pending}
            onPlace={onPlace}
            onCashout={cashout}
          />
        </>
        ) : (
          <AutoBetTab />
        )}
      </div>
    </div>
  );
}
