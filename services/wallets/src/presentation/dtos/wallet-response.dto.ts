import type { WalletView } from "../../application/wallet.view";

/**
 * Resposta REST da carteira. `balanceCents` sai como `number` (os valores do jogo
 * cabem com folga no safe-integer; internamente o dinheiro é `bigint`, sem risco de
 * precisão). Conversão `bigint → number` acontece só aqui, na borda.
 */
export interface WalletResponseDto {
  id: string;
  playerId: string;
  balanceCents: number;
  currency: string;
  version: number;
}

export function toWalletResponse(view: WalletView): WalletResponseDto {
  return {
    id: view.id,
    playerId: view.playerId,
    balanceCents: toSafeNumber(view.balanceCents),
    currency: view.currency,
    version: view.version,
  };
}

/**
 * Converte centavos `bigint` → `number` para a borda, **falhando fechado** se o
 * saldo passar do safe-integer (o teto por movimento não limita o saldo acumulado).
 * Improvável nos valores do jogo, mas é dinheiro: melhor 500 explícito que um número
 * corrompido silenciosamente no JSON.
 */
function toSafeNumber(cents: bigint): number {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Saldo excede o limite seguro de serialização");
  }
  return Number(cents);
}
