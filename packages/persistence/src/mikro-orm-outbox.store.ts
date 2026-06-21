import { LockMode } from "@mikro-orm/core";
import type { EntityManager, EntityName } from "@mikro-orm/postgresql";
import {
  errorMessage,
  type LoggerLike,
  type OutboxRecord,
  type OutboxStore,
  type PublishFn,
} from "@crash-game/messaging";

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;
/** Após N falhas a linha vira `failed` e sai do poll — equivalente, na escrita, à DLQ do consumidor. */
const MAX_PUBLISH_ATTEMPTS = 10;

export interface OutboxRowShape {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  createdAt: Date;
  sentAt: Date | null;
}

/**
 * Store de outbox MikroORM compartilhado por games e wallets. `processPending` seleciona pendentes
 * vencidas com `FOR UPDATE SKIP LOCKED` (cada instância pega um lote disjunto), publica e marca
 * `sent`/agenda backoff/vira `failed`, tudo na mesma tx. `publish` dentro da tx garante at-least-once
 * (commit falho após o envio mantém a linha pendente; o consumidor deduplica por `messageId`).
 */
export function createMikroOrmOutboxStore(
  em: EntityManager,
  entity: EntityName<OutboxRowShape>,
  logger: LoggerLike,
): OutboxStore {
  return {
    processPending(limit: number, publish: PublishFn): Promise<number> {
      return em.transactional(async (tx) => {
        const now = new Date();
        const rows = await tx.find(
          entity,
          { status: "pending", nextAttemptAt: { $lte: now } },
          {
            orderBy: { createdAt: "asc" },
            limit,
            lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
          },
        );

        for (const row of rows) {
          try {
            await publish({
              id: row.id,
              type: row.type as OutboxRecord["type"],
              payload: row.payload,
              createdAt: row.createdAt,
            });
            row.status = "sent";
            row.sentAt = new Date();
          } catch (err) {
            row.attempts += 1;
            if (row.attempts >= MAX_PUBLISH_ATTEMPTS) {
              row.status = "failed";
              logger.error(
                `Outbox ${row.id} (${row.type}) → failed após ${row.attempts} tentativas: ${errorMessage(err)}`,
              );
            } else {
              row.nextAttemptAt = new Date(Date.now() + backoffMs(row.attempts));
              logger.warn(
                `Falha ao publicar outbox ${row.id} (${row.type}), tentativa ${row.attempts}: ${errorMessage(err)}`,
              );
            }
          }
        }
        return rows.length;
      });
    },
  };
}

function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempts - 1));
}
