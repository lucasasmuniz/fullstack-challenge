import { describe, expect, it } from "bun:test";
import {
  OutboxRelay,
  type OutboxRecord,
  type PublishFn,
  type ReceivedMessage,
  type ReceiveOptions,
  type SqsClient,
} from "../src";

class FakeSqs implements SqsClient {
  sent: { queueUrl: string; body: string }[] = [];
  failNext = 0;

  send(queueUrl: string, body: string): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error("sqs down"));
    }
    this.sent.push({ queueUrl, body });
    return Promise.resolve();
  }
  receive(_url: string, _opts: ReceiveOptions): Promise<ReceivedMessage[]> {
    return Promise.resolve([]);
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeOutboxStore {
  rows: (OutboxRecord & { status: "pending" | "sent"; attempts: number })[] = [];

  add(record: OutboxRecord): void {
    this.rows.push({ ...record, status: "pending", attempts: 0 });
  }

  async processPending(limit: number, publish: PublishFn): Promise<number> {
    const batch = this.rows
      .filter((r) => r.status === "pending")
      .slice(0, limit);
    for (const row of batch) {
      try {
        await publish(row);
        row.status = "sent";
      } catch {
        row.attempts += 1;
      }
    }
    return batch.length;
  }
}

function record(id: string): OutboxRecord {
  return {
    id,
    type: "DebitFunds",
    payload: { betId: id, roundId: id, playerId: id, amountCents: 100 },
    createdAt: new Date("2026-06-20T12:00:00.000Z"),
  };
}

describe("OutboxRelay", () => {
  it("publica pendentes como envelope e marca sent", async () => {
    const sqs = new FakeSqs();
    const store = new FakeOutboxStore();
    store.add(record("11111111-1111-4111-8111-111111111111"));
    const relay = new OutboxRelay(store, sqs, {
      queueUrl: "q",
      pollIntervalMs: 10,
      batchSize: 10,
    });

    const n = await relay.drainOnce();

    expect(n).toBe(1);
    expect(sqs.sent).toHaveLength(1);
    const env = JSON.parse(sqs.sent[0].body) as {
      messageId: string;
      type: string;
      occurredAt: string;
    };
    expect(env.messageId).toBe("11111111-1111-4111-8111-111111111111");
    expect(env.type).toBe("DebitFunds");
    expect(env.occurredAt).toBe("2026-06-20T12:00:00.000Z");
    expect(store.rows[0].status).toBe("sent");
  });

  it("mantém pendente e conta a tentativa quando o SQS falha", async () => {
    const sqs = new FakeSqs();
    sqs.failNext = 1;
    const store = new FakeOutboxStore();
    store.add(record("22222222-2222-4222-8222-222222222222"));
    const relay = new OutboxRelay(store, sqs, {
      queueUrl: "q",
      pollIntervalMs: 10,
      batchSize: 10,
    });

    await relay.drainOnce();
    expect(store.rows[0].status).toBe("pending");
    expect(store.rows[0].attempts).toBe(1);

    await relay.drainOnce();
    expect(store.rows[0].status).toBe("sent");
    expect(sqs.sent).toHaveLength(1);
  });
});
