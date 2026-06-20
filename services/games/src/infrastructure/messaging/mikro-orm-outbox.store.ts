import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { createMikroOrmOutboxStore } from "@crash-game/persistence";
import type { OutboxStore, PublishFn } from "@crash-game/messaging";
import { OutboxEntity } from "../persistence/outbox.entity";

/**
 * Adapter MikroORM do `OutboxStore` (Game). Delega a lógica (SKIP LOCKED + backoff +
 * poison-pill) ao `createMikroOrmOutboxStore` compartilhado em `@crash-game/persistence` —
 * idêntica à da Wallet, antes duplicada.
 */
@Injectable()
export class MikroOrmOutboxStore implements OutboxStore {
  private readonly logger = new Logger(MikroOrmOutboxStore.name);
  private readonly store: OutboxStore;

  constructor(em: EntityManager) {
    this.store = createMikroOrmOutboxStore(em, OutboxEntity, this.logger);
  }

  processPending(limit: number, publish: PublishFn): Promise<number> {
    return this.store.processPending(limit, publish);
  }
}
