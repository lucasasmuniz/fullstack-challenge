import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

/** Uma mensagem recebida do SQS (corpo cru + handle para deletar após o ack). */
export interface ReceivedMessage {
  readonly receiptHandle: string;
  readonly body: string;
}

export interface ReceiveOptions {
  /** Long-poll: segundos que o SQS segura a chamada esperando mensagem (0–20). */
  readonly waitTimeSeconds: number;
  /** Máximo de mensagens por chamada (1–10). */
  readonly maxMessages: number;
  /** Tempo que a mensagem fica invisível para outros consumidores enquanto é processada. */
  readonly visibilityTimeoutSeconds: number;
}

/**
 * Port do SQS (hexagonal) — `send`/`receive`/`delete` por URL de fila. Mantém o pacote
 * testável com um fake e isola o `@aws-sdk` numa única borda. A URL vai por chamada (o
 * relay publica numa fila; o consumidor lê de outra), então o client não guarda estado.
 */
export interface SqsClient {
  send(queueUrl: string, body: string): Promise<void>;
  receive(queueUrl: string, opts: ReceiveOptions): Promise<ReceivedMessage[]>;
  delete(queueUrl: string, receiptHandle: string): Promise<void>;
}

export interface AwsSqsClientConfig {
  readonly region: string;
  /** Endpoint do LocalStack em dev (ex.: `http://localstack:4566`); omitido em produção AWS. */
  readonly endpoint?: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Timeout para estabelecer a conexão TCP (ms). Default 3000. */
  readonly connectionTimeoutMs?: number;
  /**
   * Timeout total da requisição (ms). **Precisa ser > o `waitTimeSeconds` do long-poll**,
   * senão aborta todo `receive` legítimo. Default 30000 (> 20s, o teto do long-poll do SQS).
   */
  readonly requestTimeoutMs?: number;
  /** Tentativas do SDK por chamada (inclui a 1ª). Default 3. */
  readonly maxAttempts?: number;
}

/** Default do `requestTimeout`: acima do teto de long-poll do SQS (20s) com folga. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 3000;
const DEFAULT_MAX_ATTEMPTS = 3;

/** Adapter do AWS SDK v3. Em dev aponta para o LocalStack via `endpoint`. */
export class AwsSqsClient implements SqsClient {
  private readonly sqs: SQSClient;

  constructor(config: AwsSqsClientConfig) {
    this.sqs = new SQSClient({
      region: config.region,
      endpoint: config.endpoint,
      // Sem timeout, o SDK v3 pendura uma conexão TCP morta para sempre, congelando o loop
      // do consumer/relay. O `requestTimeout` cobre o long-poll; o `connectionTimeout`, o
      // handshake. `requestHandler` aceita um objeto de opções (sem dependência extra).
      maxAttempts: config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      requestHandler: {
        connectionTimeout:
          config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
        requestTimeout: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      },
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async send(queueUrl: string, body: string): Promise<void> {
    await this.sqs.send(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }),
    );
  }

  async receive(
    queueUrl: string,
    opts: ReceiveOptions,
  ): Promise<ReceivedMessage[]> {
    const out = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        WaitTimeSeconds: opts.waitTimeSeconds,
        MaxNumberOfMessages: opts.maxMessages,
        VisibilityTimeout: opts.visibilityTimeoutSeconds,
      }),
    );
    return (out.Messages ?? [])
      .filter((m) => m.ReceiptHandle !== undefined && m.Body !== undefined)
      .map((m) => ({
        receiptHandle: m.ReceiptHandle as string,
        body: m.Body as string,
      }));
  }

  async delete(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  destroy(): void {
    this.sqs.destroy();
  }
}
