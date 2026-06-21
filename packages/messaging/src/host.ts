import { OutboxRelay, type OutboxRelayConfig, type OutboxStore } from "./outbox";
import { SqsConsumer, type HandlerMap } from "./sqs-consumer";
import type { ReceiveOptions, SqsClient } from "./sqs-client";

/** Logger estrutural compatível com o do NestJS, sem importá-lo (mantém o pacote livre de framework). */
export interface LoggerLike {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface InboxConsumerOptions {
  readonly queueLabel: string;
  readonly queueUrl: string;
  readonly receive: ReceiveOptions;
  readonly handlers: HandlerMap;
  readonly logger: LoggerLike;
}

/** `SqsConsumer` com erro padronizado: loga sem o corpo; corpo cru só em `debug` (evita PII no log). */
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
  readonly destinationLabel: string;
}

export function createOutboxRelay(opts: OutboxRelayHostOptions): OutboxRelay {
  return new OutboxRelay(opts.store, opts.client, opts.config, (err) =>
    opts.logger.error(
      `Falha no relay da outbox (→ ${opts.destinationLabel}): ${errorMessage(err)}`,
    ),
  );
}
