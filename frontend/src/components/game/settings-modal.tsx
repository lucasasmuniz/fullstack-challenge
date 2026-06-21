"use client";

import { Settings, LogOut, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { usePrefsStore } from "@/stores/prefs-store";
import { useAuthActions } from "@/hooks/use-auth-actions";
import { useRoundHistory } from "@/hooks/use-rounds";
import { useUiStore } from "@/stores/ui-store";

type PrefKey = "soundMaster" | "soundBet" | "soundCashout" | "soundCrash" | "showFormula";

interface Row {
  readonly key: PrefKey;
  readonly label: string;
  readonly desc: string;
}

const GROUPS: ReadonlyArray<{ title: string; rows: readonly Row[] }> = [
  {
    title: "Som",
    rows: [
      { key: "soundMaster", label: "Efeitos sonoros", desc: "Liga/desliga todos os sons" },
      { key: "soundBet", label: "Som de aposta", desc: "Ao confirmar uma aposta" },
      { key: "soundCashout", label: "Som de cashout", desc: "Ao sacar com lucro" },
      { key: "soundCrash", label: "Som de crash", desc: "Quando a rodada crasha" },
    ],
  },
  {
    title: "Interface",
    rows: [
      { key: "showFormula", label: "Exibir fórmula da curva", desc: "Mostra m = e^(k·t) no gráfico" },
    ],
  },
];

/** Configurações: preferências de som + UI (persistidas) e logout explícito. */
export function SettingsModal() {
  const close = useUiStore((s) => s.close);
  const openModal = useUiStore((s) => s.open);
  const prefs = usePrefsStore();
  const { logout } = useAuthActions();
  const { data: history } = useRoundHistory(1);
  const lastRound = history?.items[0];

  return (
    <Modal title="Configurações" icon={Settings} onClose={close} maxWidth="max-w-md">
      <div className="flex flex-col gap-5 p-6">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-faint">{group.title}</span>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {group.rows.map((row, i) => {
                const disabled = row.key !== "soundMaster" && row.key.startsWith("sound") && !prefs.soundMaster;
                return (
                  <div
                    key={row.key}
                    className={`flex items-center gap-4 px-4 py-3 ${i > 0 ? "border-t border-line" : ""} ${disabled ? "opacity-50" : ""}`}
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">{row.label}</div>
                      <div className="text-[11.5px] text-faint">{row.desc}</div>
                    </div>
                    <Toggle
                      checked={prefs[row.key]}
                      onChange={() => prefs.toggle(row.key)}
                      label={row.label}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-faint">Provably Fair</span>
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3">
            <div className="flex-1">
              <div className="text-sm font-medium">Verificar última rodada</div>
              <div className="text-[11.5px] text-faint">
                {lastRound ? `Seed revelada · rodada #${lastRound.roundNumber}` : "Sem rodada concluída ainda"}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!lastRound}
              onClick={() => lastRound && openModal({ type: "verify", roundId: lastRound.id })}
            >
              <ShieldCheck className="size-4" />
              Verificar
            </Button>
          </div>
        </div>

        <Button variant="danger" onClick={logout} className="mt-1 w-full">
          <LogOut className="size-4" />
          Sair da conta
        </Button>
      </div>
    </Modal>
  );
}
