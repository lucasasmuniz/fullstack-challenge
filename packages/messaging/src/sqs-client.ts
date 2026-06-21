import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

export interface ReceivedMessage {
  readonly receiptHandle: string;
  readonly body: string;
}

export interface ReceiveOptions {
  readonly waitTimeSeconds: number;
  readonly maxMessages: number;
  readonly visibilityTimeoutSeconds: number;
}

export interface SqsClient {
  send(queueUrl: string, body: string): Promise<void>;
  receive(queueUrl: string, opts: ReceiveOptions): Promise<ReceivedMessage[]>;
  delete(queueUrl: string, receiptHandle: string): Promise<void>;
}

export interface AwsSqsClientConfig {
  readonly region: string;
  readonly endpoint?: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly connectionTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly maxAttempts?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 3000;
const DEFAULT_MAX_ATTEMPTS = 3;

export class AwsSqsClient implements SqsClient {
  private readonly sqs: SQSClient;

  constructor(config: AwsSqsClientConfig) {
    this.sqs = new SQSClient({
      region: config.region,
      endpoint: config.endpoint,
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
