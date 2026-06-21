import { describe, expect, it } from "bun:test";
import {
  IntegrationEventType,
  integrationMessageSchema,
  parseIntegrationMessage,
} from "../src";

const BET_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const ROUND_ID = "44444444-4444-4444-8444-444444444444";

function envelope(type: string, payload: unknown): unknown {
  return {
    messageId: "33333333-3333-4333-8333-333333333333",
    type,
    occurredAt: "2026-06-20T12:00:00.000Z",
    payload,
  };
}

describe("integration-events contracts", () => {
  it("valida um DebitFunds bem-formado", () => {
    const msg = envelope("DebitFunds", {
      betId: BET_ID,
      roundId: ROUND_ID,
      playerId: PLAYER_ID,
      amountCents: 500,
    });
    const parsed = parseIntegrationMessage(msg);
    expect(parsed.type).toBe(IntegrationEventType.DebitFunds);
    expect(parsed.payload.amountCents).toBe(500);
  });

  it("rejeita amountCents não-inteiro (sem float em dinheiro)", () => {
    const msg = envelope("DebitFunds", {
      betId: BET_ID,
      roundId: ROUND_ID,
      playerId: PLAYER_ID,
      amountCents: 1.5,
    });
    expect(() => parseIntegrationMessage(msg)).toThrow();
  });

  it("rejeita amountCents <= 0", () => {
    const msg = envelope("CreditFunds", {
      betId: BET_ID,
      playerId: PLAYER_ID,
      amountCents: 0,
      reason: "cashout",
    });
    expect(() => parseIntegrationMessage(msg)).toThrow();
  });

  it("restringe a razão de crédito a cashout|refund", () => {
    const ok = envelope("CreditFunds", {
      betId: BET_ID,
      playerId: PLAYER_ID,
      amountCents: 1000,
      reason: "refund",
    });
    expect(parseIntegrationMessage(ok).type).toBe("CreditFunds");

    const bad = envelope("CreditFunds", {
      betId: BET_ID,
      playerId: PLAYER_ID,
      amountCents: 1000,
      reason: "deposit",
    });
    expect(() => parseIntegrationMessage(bad)).toThrow();
  });

  it("rejeita type desconhecido", () => {
    const msg = envelope("Whatever", {});
    expect(() => parseIntegrationMessage(msg)).toThrow();
  });

  it("o schema por-type rejeita um type divergente do esperado", () => {
    const msg = envelope("FundsDebited", {
      betId: BET_ID,
      roundId: ROUND_ID,
      playerId: PLAYER_ID,
      amountCents: 500,
    });
    expect(() =>
      integrationMessageSchema(IntegrationEventType.DebitFunds).parse(msg),
    ).toThrow();
  });
});
