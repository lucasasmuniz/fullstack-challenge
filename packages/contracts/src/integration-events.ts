import { z } from "zod";

/**
 * Contratos dos integration events trocados via SQS entre Game e Wallet. Produtor e consumidor
 * validam o mesmo schema na borda (mudança incompatível → falha no parse, nunca corrompe dinheiro).
 *
 * Dois invariantes não-óbvios do fio:
 * - dinheiro = `number` (centavos inteiros), nunca `bigint` (JSON não serializa bigint; a conversão
 *   para `Money` acontece dentro de cada serviço);
 * - `correlationId` da saga é sempre o `betId` — a idempotência da Wallet é escopada por
 *   `(reason, correlationId)`, então `bet`/`cashout`/`refund` do mesmo `betId` são distintos.
 */

const amountCents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const uuid = z.string().uuid();

export const CreditReason = z.enum(["cashout", "refund"]);
export type CreditReason = z.infer<typeof CreditReason>;

export const DebitFundsPayload = z.object({
  betId: uuid,
  roundId: uuid,
  playerId: uuid,
  amountCents,
});
export type DebitFundsPayload = z.infer<typeof DebitFundsPayload>;

export const CreditFundsPayload = z.object({
  betId: uuid,
  playerId: uuid,
  amountCents,
  reason: CreditReason,
});
export type CreditFundsPayload = z.infer<typeof CreditFundsPayload>;

export const FundsDebitedPayload = z.object({
  betId: uuid,
  roundId: uuid,
  playerId: uuid,
  amountCents,
});
export type FundsDebitedPayload = z.infer<typeof FundsDebitedPayload>;

export const FundsDebitRejectedPayload = z.object({
  betId: uuid,
  roundId: uuid,
  playerId: uuid,
  amountCents,
  reason: z.string().min(1),
});
export type FundsDebitRejectedPayload = z.infer<typeof FundsDebitRejectedPayload>;

export const FundsCreditedPayload = z.object({
  betId: uuid,
  playerId: uuid,
  amountCents,
  reason: CreditReason,
});
export type FundsCreditedPayload = z.infer<typeof FundsCreditedPayload>;

export const IntegrationEventType = {
  DebitFunds: "DebitFunds",
  CreditFunds: "CreditFunds",
  FundsDebited: "FundsDebited",
  FundsDebitRejected: "FundsDebitRejected",
  FundsCredited: "FundsCredited",
} as const;
export type IntegrationEventType =
  (typeof IntegrationEventType)[keyof typeof IntegrationEventType];

export const PAYLOAD_SCHEMA = {
  DebitFunds: DebitFundsPayload,
  CreditFunds: CreditFundsPayload,
  FundsDebited: FundsDebitedPayload,
  FundsDebitRejected: FundsDebitRejectedPayload,
  FundsCredited: FundsCreditedPayload,
} as const satisfies Record<IntegrationEventType, z.ZodTypeAny>;

export type PayloadFor<T extends IntegrationEventType> = z.infer<
  (typeof PAYLOAD_SCHEMA)[T]
>;

/**
 * Envelope de toda mensagem de integração. `messageId` é a chave de idempotência do consumidor
 * (inbox dedup) — vem da `id` da linha da outbox, estável entre retries do relay.
 */
export interface IntegrationMessage<T extends IntegrationEventType = IntegrationEventType> {
  readonly messageId: string;
  readonly type: T;
  readonly occurredAt: string;
  readonly payload: PayloadFor<T>;
}

export function integrationMessageSchema<T extends IntegrationEventType>(
  type: T,
): z.ZodType<IntegrationMessage<T>> {
  return z.object({
    messageId: uuid,
    type: z.literal(type),
    occurredAt: z.string().datetime(),
    payload: PAYLOAD_SCHEMA[type],
  }) as z.ZodType<IntegrationMessage<T>>;
}

export function parseIntegrationMessage(raw: unknown): IntegrationMessage {
  const base = z
    .object({ type: z.nativeEnum(IntegrationEventType) })
    .parse(raw);
  return integrationMessageSchema(base.type).parse(raw);
}
