import type { Wallet } from "../domain";

/** Read model da carteira (saída de queries/handlers, sem expor o agregado). */
export interface WalletView {
  id: string;
  playerId: string;
  balanceCents: bigint;
  currency: string;
  version: number;
}

export function toWalletView(wallet: Wallet): WalletView {
  return {
    id: wallet.id,
    playerId: wallet.playerId,
    balanceCents: wallet.balance.toCents(),
    currency: wallet.currency,
    version: wallet.version,
  };
}
