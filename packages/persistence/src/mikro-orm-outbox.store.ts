import { LockMode } from "@mikro-orm/core";
import type { EntityManager, EntityName } from "@mikro-orm/postgresql";
import {
  errorMessage,
  type LoggerLike,
  type OutboxRecord,
  type OutboxStore,
  type PublishFn,
} from "@crash-game/messaging";

/** Backoff exponencial limitado para a republicação de uma linha que falhou. */
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;
/**
 * Poison-pill escape: após N falhas a linha vira `failed` e sai do ciclo de poll (o filtro
 * `status='pending'` a ignora) — o equivalente, na escrita, à DLQ que o consumidor tem via
 * `maxReceiveCount`. Evita retry infinito de uma linha venenosa.
 */
const MAX_PUBLISH_ATTEMPTS = 10;

/** Forma mínima de uma linha de outbox que o store manipula (cada serviço tem sua entidade). */
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
 * Store de outbox MikroORM **compartilhado** (games e wallets têm a MESMA lógica; antes era
 * duplicada). `processPending` abre uma tx, seleciona pendentes vencidas com `FOR UPDATE SKIP
 * LOCKED` (cada instância pega um lote disjunto, sem contenção), publica cada uma e marca
 * `sent` / agenda backoff / vira `failed` (poison-pill) — tudo na mesma tx. Manter o `publish`
 * dentro da tx garante at-least-once (se o commit falhar após o envio, a linha continua
 * pendente e o consumidor deduplica por `messageId`).
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
