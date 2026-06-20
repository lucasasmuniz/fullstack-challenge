import {
  parseIntegrationMessage,
  type IntegrationEventType,
  type IntegrationMessage,
} from "@crash-game/contracts";
import type { ReceiveOptions, SqsClient } from "./sqs-client";

/** Handler de um tipo de mensagem. Deve ser **idempotente** (a entrega é at-least-once). */
export type MessageHandler<T extends IntegrationEventType = IntegrationEventType> = (
  message: IntegrationMessage<T>,
) => Promise<void>;

export type HandlerMap = {
  readonly [T in IntegrationEventType]?: MessageHandler<T>;
};

export interface SqsConsumerConfig {
  readonly queueUrl: string;
  readonly receive: ReceiveOptions;
  /**
   * Espera (macrotask) após um receive vazio. Em produção o long-poll (`waitTimeSeconds`)
   * já segura a chamada, então pode ser pequena; com `waitTimeSeconds=0` (testes) ela é
   * essencial para o loop **ceder** e não famintar o `stop()`. Default 250ms.
   */
  readonly idlePollDelayMs?: number;
}

/**
 * Consumidor SQS long-poll. Por mensagem: valida o envelope (zod do `@crash-game/contracts`),
 * despacha para o handler do `type` e **deleta no sucesso** (ack). Erro de parse (contrato
 * quebrado) ou throw do handler → **não deleta** → a mensagem reaparece após o visibility
 * timeout → retry; após `maxReceiveCount` (redrive policy, já configurada nas filas) vai p/
 * a DLQ. A idempotência (inbox + máquinas de estado) torna o retry seguro.
 *
 * Mensagem cujo `type` não tem handler nesta fila é tratada como ruído e deletada (ack), para
 * não entupir a fila — cada fila só recebe os tipos que lhe interessam por design.
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
          // Receive vazio: cede o event loop (macrotask) — sem isto, com long-poll=0 o
          // while famintaria os timers (ex.: o do stop()) num busy-loop de microtasks.
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
        // Erro de rede no receive: pequena espera para não fazer busy-loop.
        await delay(1000);
      }
    }
  }

  private async handleOne(body: string, receiptHandle: string): Promise<void> {
    let message: IntegrationMessage;
    try {
      message = parseIntegrationMessage(JSON.parse(body));
    } catch (err) {
      // Contrato inválido: não deleta → DLQ via redrive. Loga para diagnóstico.
      this.onError(err, body);
      return;
    }

    const handler = this.handlers[message.type] as
      | MessageHandler
      | undefined;
    if (!handler) {
      // Tipo sem handler nesta fila = ruído; ack para não reprocessar eternamente.
      await this.client.delete(this.config.queueUrl, receiptHandle);
      return;
    }

    try {
      await handler(message);
      await this.client.delete(this.config.queueUrl, receiptHandle);
    } catch (err) {
      // Falha de processamento: não deleta → retry/DLQ.
      this.onError(err, body);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
