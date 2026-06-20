import { OutboxRelay, type OutboxRelayConfig, type OutboxStore } from "./outbox";
import { SqsConsumer, type HandlerMap } from "./sqs-consumer";
import type { ReceiveOptions, SqsClient } from "./sqs-client";

/**
 * Logger estrutural (compatível com o `Logger` do NestJS, mas sem importá-lo) — mantém o
 * pacote livre de framework. Qualquer logger com estes métodos serve.
 */
export interface LoggerLike {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/** Normaliza um erro desconhecido para mensagem legível (sem vazar stack ao cliente/log). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface InboxConsumerOptions {
  /** Rótulo da fila para logs (ex.: `"game-inbox"`). */
  readonly queueLabel: string;
  readonly queueUrl: string;
  readonly receive: ReceiveOptions;
  readonly handlers: HandlerMap;
  readonly logger: LoggerLike;
}

/**
 * Monta um `SqsConsumer` com o callback de erro padronizado (idêntico entre serviços): loga a
 * falha **sem** o corpo e o corpo cru só em `debug` — evita PII (playerId/betId) no log padrão.
 * Não inicia: o chamador chama `.start()`.
 */
export function createInboxConsumer(
  client: SqsClient,
  opts: InboxConsumerOptions,
): SqsConsumer {
  return new SqsConsumer(
    client,
    opts.handlers,
    { queueUrl: opts.queueUrl, receive: opts.receive },
    (err, body) => {
      opts.logger.error(
        `Falha ao processar mensagem do ${opts.queueLabel}: ${errorMessage(err)}`,
      );
      if (body) {
        opts.logger.debug(`${opts.queueLabel} body: ${body}`);
      }
    },
  );
}

export interface OutboxRelayHostOptions {
  readonly store: OutboxStore;
  readonly client: SqsClient;
  readonly config: OutboxRelayConfig;
  readonly logger: LoggerLike;
  /** Rótulo da fila destino para logs (ex.: `"wallet-inbox"`). */
  readonly destinationLabel: string;
}

/** Monta um `OutboxRelay` com o callback de erro padronizado. Não inicia: o chamador chama `.start()`. */
export function createOutboxRelay(opts: OutboxRelayHostOptions): OutboxRelay {
  return new OutboxRelay(opts.store, opts.client, opts.config, (err) =>
    opts.logger.error(
      `Falha no relay da outbox (→ ${opts.destinationLabel}): ${errorMessage(err)}`,
    ),
  );
}
