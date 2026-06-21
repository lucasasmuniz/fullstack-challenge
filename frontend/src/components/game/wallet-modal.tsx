"use client";

import { useState } from "react";
import { Plus, ArrowUpRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/use-wallet";
import { useWalletActions } from "@/hooks/use-wallet-actions";
import { useUiStore } from "@/stores/ui-store";
import { formatBRL } from "@/lib/utils";

const MAX = 1_000_000;
const QUICK = [1_000, 5_000, 10_000];

/** Modal de depósito ou saque (REST self-service, Idempotency-Key). `mode` define a operação. */
export function WalletModal({ mode }: { mode: "deposit" | "withdraw" }) {
  const close = useUiStore((s) => s.close);
  const { data: wallet } = useWallet();
  const { deposit, withdraw, pending } = useWalletActions();
  const [amount, setAmount] = useState(5_000);

  const isDeposit = mode === "deposit";
  const balance = wallet?.balanceCents ?? 0;
  const overBalance = !isDeposit && amount > balance;

  const submit = async () => {
    const ok = await (isDeposit ? deposit(amount) : withdraw(amount));
    if (ok) close();
  };

  return (
    <Modal
      title={isDeposit ? "Depositar" : "Sacar"}
      subtitle={`${isDeposit ? "Saldo atual" : "Disponível"}: ${formatBRL(balance)}`}
      icon={isDeposit ? Plus : ArrowUpRight}
      onClose={close}
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-4 p-6">
        <NumberInput
          valueCents={amount}
          onChange={setAmount}
          min={100}
          max={isDeposit ? MAX : balance}
          step={1_000}
          error={overBalance ? `Máximo disponível: ${formatBRL(balance)}` : undefined}
        />
        <div className="flex flex-wrap gap-2">
          {QUICK.map((c) => (
            <Chip key={c} onClick={() => setAmount((a) => Math.min(MAX, a + c))}>
              +{c / 100}
            </Chip>
          ))}
          {!isDeposit && <Chip onClick={() => setAmount(balance)}>Tudo</Chip>}
        </div>
        <Button
          size="lg"
          loading={pending}
          disabled={overBalance || amount < 100}
          onClick={submit}
          className="w-full"
        >
          {isDeposit ? "Depositar" : "Sacar"} {formatBRL(amount)}
        </Button>
      </div>
    </Modal>
  );
}
