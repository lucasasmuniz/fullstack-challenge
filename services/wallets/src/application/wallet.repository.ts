import type { Wallet } from "../domain/wallet";
import type { WalletReason } from "../domain/wallet-reason";
import type { WalletView } from "./wallet.view";

/**
 * Port do repositório da Wallet (hexagonal). A aplicação depende desta interface;
 * o adapter MikroORM (infrastructure) a implementa. O carregamento reconstrói o
 * agregado pelo `fold` dos eventos; o `save` persiste os novos eventos + projeção
 * na mesma transação.
 */
export interface WalletRepository {
  /** Carrega e reconstrói o agregado (fold dos eventos) — lado de escrita. */
  findByPlayerId(playerId: string): Promise<Wallet | null>;
  /** Lê a projeção de saldo — lado de leitura (CQRS). */
  findViewByPlayerId(playerId: string): Promise<WalletView | null>;
  save(wallet: Wallet): Promise<void>;
  /**
   * Idempotência REST **escopada por carteira**: devolve o valor do movimento já
   * aplicado para este (walletId, reason, correlationId), ou `null` se nunca foi
   * processado. Escopar por `walletId` evita que a key de um jogador interfira na de
   * outro; devolver o `amountCents` permite detectar reuso de key com payload
   * diferente (Idempotency-Key conflict).
   */
  findProcessedMovement(
    walletId: string,
    reason: WalletReason,
    correlationId: string,
  ): Promise<{ amountCents: bigint } | null>;
}

/** Token DI para injetar a implementação do {@link WalletRepository}. */
export const WALLET_REPOSITORY = Symbol("WALLET_REPOSITORY");
