import { describe, expect, it } from "bun:test";
import type { IntegrationMessage } from "@crash-game/contracts";
import {
  SqsConsumer,
  type ReceivedMessage,
  type ReceiveOptions,
  type SqsClient,
} from "../src";

const RECEIVE: ReceiveOptions = {
  waitTimeSeconds: 0,
  maxMessages: 10,
  visibilityTimeoutSeconds: 30,
};

/** SQS fake com fila pré-carregada; registra o que foi deletado (ack). */
class ScriptedSqs implements SqsClient {
  deleted: string[] = [];
  constructor(private queue: ReceivedMessage[]) {}

  send(): Promise<void> {
    return Promise.resolve();
  }
  receive(_url: string, _opts: ReceiveOptions): Promise<ReceivedMessage[]> {
    const batch = this.queue;
    this.queue = [];
    return Promise.resolve(batch);
  }
  delete(_url: string, receiptHandle: string): Promise<void> {
    this.deleted.push(receiptHandle);
    return Promise.resolve();
  }
}

function msg(receiptHandle: string, body: unknown): ReceivedMessage {
  return { receiptHandle, body: JSON.stringify(body) };
}

function debitEnvelope(betId: string): unknown {
  return {
    messageId: betId,
    type: "DebitFunds",
    occurredAt: "2026-06-20T12:00:00.000Z",
    payload: { betId, roundId: betId, playerId: betId, amountCents: 100 },
  };
}

const BET = "11111111-1111-4111-8111-111111111111";

async function drainOnce(consumer: SqsConsumer): Promise<void> {
  consumer.start();
  await new Promise((r) => setTimeout(r, 20));
  await consumer.stop();
}

describe("SqsConsumer", () => {
  it("despacha ao handler do type e deleta no sucesso", async () => {
    const sqs = new ScriptedSqs([msg("rh-1", debitEnvelope(BET))]);
    const seen: IntegrationMessage[] = [];
    const consumer = new SqsConsumer(
      sqs,
      { DebitFunds: (m) => { seen.push(m); return Promise.resolve(); } },
      { queueUrl: "q", receive: RECEIVE, idlePollDelayMs: 5 },
    );

    await drainOnce(consumer);

    expect(seen).toHaveLength(1);
    expect(seen[0].payload.betId).toBe(BET);
    expect(sqs.deleted).toEqual(["rh-1"]);
  });

  it("não deleta quando o handler lança (→ retry/DLQ)", async () => {
    const sqs = new ScriptedSqs([msg("rh-2", debitEnvelope(BET))]);
    const consumer = new SqsConsumer(
      sqs,
      { DebitFunds: () => Promise.reject(new Error("boom")) },
      { queueUrl: "q", receive: RECEIVE, idlePollDelayMs: 5 },
    );

    await drainOnce(consumer);
    expect(sqs.deleted).toEqual([]);
  });

  it("deleta (ack) mensagem com contrato inválido? não — vai para DLQ", async () => {
    const sqs = new ScriptedSqs([msg("rh-3", { type: "DebitFunds", bad: true })]);
    const consumer = new SqsConsumer(
      sqs,
      { DebitFunds: () => Promise.resolve() },
      { queueUrl: "q", receive: RECEIVE, idlePollDelayMs: 5 },
    );

    await drainOnce(consumer);
    expect(sqs.deleted).toEqual([]);
  });

  it("deleta (ack) mensagem de type sem handler nesta fila", async () => {
    const sqs = new ScriptedSqs([msg("rh-4", debitEnvelope(BET))]);
    const consumer = new SqsConsumer(
      sqs,
      { FundsCredited: () => Promise.resolve() },
      { queueUrl: "q", receive: RECEIVE, idlePollDelayMs: 5 },
    );

    await drainOnce(consumer);
    expect(sqs.deleted).toEqual(["rh-4"]);
  });
});
