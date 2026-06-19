import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Wallet, type WalletDomainEvent, type WalletReason } from "../../domain";
import type { WalletRepository } from "../../application/wallet.repository";
import type { WalletView } from "../../application/wallet.view";
import { WalletEntity } from "./wallet.entity";
import { WalletEventEntity } from "./wallet-event.entity";
import { toDomainEvent, toRow } from "./wallet-event.mapper";

/**
 * Adapter MikroORM do {@link WalletRepository}.
 *
 * - `findByPlayerId`: localiza a carteira pela projeção, carrega o stream de
 *   eventos (ordenado por `version`) e reconstrói o agregado (`Wallet.rebuild`).
 * - `save`: numa **única transação**, faz append dos novos eventos e atualiza a
 *   projeção de saldo — atomicidade entre ledger e read model. A
 *   `UNIQUE(wallet_id, version)` dá a concorrência otimista e a
 *   `UNIQUE(wallet_id, reason, correlation_id)` a idempotência por carteira
 *   (ambas falham fechado).
 *
 * Cada método usa um `fork()` do EntityManager (contexto/identity-map próprio),
 * evitando vazamento entre requisições.
 */
@Injectable()
export class MikroOrmWalletRepository implements WalletRepository {
  constructor(private readonly em: EntityManager) {}

  async findByPlayerId(playerId: string): Promise<Wallet | null> {
    const em = this.em.fork();
    const projection = await em.findOne(WalletEntity, { playerId });
    if (!projection) {
      return null;
    }
    const rows = await em.find(
      WalletEventEntity,
      { walletId: projection.id },
      { orderBy: { version: "asc" } },
    );
    return Wallet.rebuild(rows.map(toDomainEvent));
  }

  async findViewByPlayerId(playerId: string): Promise<WalletView | null> {
    const em = this.em.fork();
    const projection = await em.findOne(WalletEntity, { playerId });
    if (!projection) {
      return null;
    }
    return {
      id: projection.id,
      playerId: projection.playerId,
      balanceCents: projection.balanceCents,
      currency: projection.currency,
      version: projection.version,
    };
  }

  async save(wallet: Wallet): Promise<void> {
    const events = wallet.pullEvents() as WalletDomainEvent[];
    if (events.length === 0) {
      return;
    }

    await this.em.transactional(async (em) => {
      for (const event of events) {
        em.persist(em.create(WalletEventEntity, toRow(event)));
      }

      const projection = await em.findOne(WalletEntity, { id: wallet.id });
      if (projection) {
        projection.balanceCents = wallet.balance.toCents();
        projection.version = wallet.version;
      } else {
        em.persist(
          em.create(WalletEntity, {
            id: wallet.id,
            playerId: wallet.playerId,
            balanceCents: wallet.balance.toCents(),
            version: wallet.version,
            currency: wallet.currency,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );
      }
    });
  }

  async findProcessedMovement(
    walletId: string,
    reason: WalletReason,
    correlationId: string,
  ): Promise<{ amountCents: bigint } | null> {
    const em = this.em.fork();
    const row = await em.findOne(WalletEventEntity, {
      walletId,
      reason,
      correlationId,
    });
    return row ? { amountCents: row.amountCents } : null;
  }
}
