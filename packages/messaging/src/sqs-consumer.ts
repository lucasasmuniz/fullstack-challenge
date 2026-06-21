import {
  parseIntegrationMessage,
  type IntegrationEventType,
  type IntegrationMessage,
} from "@crash-game/contracts";
import type { ReceiveOptions, SqsClient } from "./sqs-client";

/** Handler de um tipo de mensagem. Deve ser idempotente (entrega at-least-once). */
export type MessageHandler<T extends IntegrationEventType = IntegrationEventType> = (
  message: IntegrationMessage<T>,
) => Promise<void>;

export type HandlerMap = {
  readonly [T in IntegrationEventType]?: MessageHandler<T>;
};

export interface SqsConsumerConfig {
  readonly queueUrl: string;
  readonly receive: ReceiveOptions;
  readonly idlePollDelayMs?: number;
}

/**
 * Consumidor SQS long-poll. Por mensagem: valida o envelope, despacha para o handler do `type` e
 * deleta no sucesso (ack). Erro de parse ou throw do handler não deleta → a mensagem reaparece
 * após o visibility timeout (retry; DLQ após `maxReceiveCount`). Tipo sem handler nesta fila é
 * deletado como ruído.
 */
export class SqsConsumer {
  private running = false;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly client: SqsClient,
    private readonly handlers: HandlerMap,
    private readonly config: SqsConsumerConfig,
    private readonly onError: (err: unknown, body?: string) => void = () => {},
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.loop = this.runLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.loop) {
      await this.loop;
      this.loop = null;
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        const messages = await this.client.receive(
          this.config.queueUrl,
          this.config.receive,
        );
        if (messages.length === 0) {
          await delay(this.config.idlePollDelayMs ?? 250);
          continue;
        }
        for (const raw of messages) {
          if (!this.running) {
            break;
          }
          await this.handleOne(raw.body, raw.receiptHandle);
        }
      } catch (err) {
        this.onError(err);
        await delay(1000);
      }
    }
  }

  private async handleOne(body: string, receiptHandle: string): Promise<void> {
    let message: IntegrationMessage;
    try {
      message = parseIntegrationMessage(JSON.parse(body));
    } catch (err) {
      this.onError(err, body);
      return;
    }

    const handler = this.handlers[message.type] as
      | MessageHandler
      | undefined;
    if (!handler) {
      await this.client.delete(this.config.queueUrl, receiptHandle);
      return;
    }

    try {
      await handler(message);
      await this.client.delete(this.config.queueUrl, receiptHandle);
    } catch (err) {
      this.onError(err, body);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
