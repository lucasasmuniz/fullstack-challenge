import { z } from "zod";

/**
 * Contratos dos **integration events** trocados via SQS entre Game e Wallet (Etapa 5).
 *
 * Shared kernel (ADR 0004): produtor e consumidor concordam no **mesmo** schema. Cada
 * lado valida a mensagem na borda do SQS com o zod daqui — uma mudança de contrato que
 * quebre a outra ponta falha no parse (rejeita/DLQ), nunca corrompe dinheiro silenciosamente.
 *
 * **Dinheiro no fio = `number` (centavos inteiros), não `bigint`** (ADR 0010): os valores do
 * jogo cabem com folga no safe-integer (máx. aposta 100.000 centavos), e JSON não serializa
 * `bigint`. A conversão `number → Money(bigint)` acontece só dentro de cada serviço.
 *
 * `correlationId` da saga é sempre o **`betId`** (idempotência da Wallet escopada por
 * `(reason, correlationId)`), então `bet`/`cashout`/`refund` do mesmo `betId` são distintos.
 */

/** Centavos inteiros, positivos, dentro do safe-integer (sem float, sem bigint no fio). */
const amountCents = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const uuid = z.string().uuid();

/** Razão de um crédito cross-service: cashout (ganho) ou refund (compensação de late-debit). */
export const CreditReason = z.enum(["cashout", "refund"]);
export type CreditReason = z.infer<typeof CreditReason>;

// ---- Comandos: Game → Wallet (fila `wallet-inbox`) -------------------------

/**
 * Debita a aposta da carteira do jogador. Resposta: `FundsDebited` | `FundsDebitRejected`.
 * Carrega o `roundId` para o Game decidir confirm-vs-refund (late-debit) sem reler a aposta.
 */
export const DebitFundsPayload = z.object({
  betId: uuid,
  roundId: uuid,
  playerId: uuid,
  amountCents,
});
export type DebitFundsPayload = z.infer<typeof DebitFundsPayload>;

/** Credita o pagamento (cashout) ou a restituição (refund) na carteira. Resposta: `FundsCredited`. */
export const CreditFundsPayload = z.object({
  betId: uuid,
  playerId: uuid,
  amountCents,
  reason: CreditReason,
});
export type CreditFundsPayload = z.infer<typeof CreditFundsPayload>;

// ---- Eventos: Wallet → Game (fila `game-inbox`) ----------------------------

/**
 * Débito aplicado ⇒ a aposta vira `CONFIRMED` (ou `REFUNDED`, se a rodada já terminou). O
 * `roundId` (eco do comando) deixa o Game ler só o `Round` para decidir confirm-vs-refund.
 */
export const FundsDebitedPayload = z.object({
  betId: uuid,
  roundId: uuid,
  playerId: uuid,
  amountCents,
});
export type FundsDebitedPayload = z.infer<typeof FundsDebitedPayload>;

/** Débito recusado (saldo insuficiente) ⇒ a aposta vira `REJECTED`. Ecoa o `roundId` (WS). */
export const FundsDebitRejectedPayload = z.object({
  betId: uuid,
  roundId: uuid,
  playerId: uuid,
  amountCents,
  reason: z.string().min(1),
});
export type FundsDebitRejectedPayload = z.infer<typeof FundsDebitRejectedPayload>;

/** Crédito aplicado ⇒ ack idempotente no Game (aposta já `CASHED_OUT`/`REFUNDED`). */
export const FundsCreditedPayload = z.object({
  betId: uuid,
  playerId: uuid,
  amountCents,
  reason: CreditReason,
});
export type FundsCreditedPayload = z.infer<typeof FundsCreditedPayload>;

// ---- Tipos de mensagem (discriminador do envelope) -------------------------

export const IntegrationEventType = {
  DebitFunds: "DebitFunds",
  CreditFunds: "CreditFunds",
  FundsDebited: "FundsDebited",
  FundsDebitRejected: "FundsDebitRejected",
  FundsCredited: "FundsCredited",
} as const;
export type IntegrationEventType =
  (typeof IntegrationEventType)[keyof typeof IntegrationEventType];

/** Mapa `type → schema do payload` — usado pelo consumidor para validar/despachar. */
export const PAYLOAD_SCHEMA = {
  DebitFunds: DebitFundsPayload,
  CreditFunds: CreditFundsPayload,
  FundsDebited: FundsDebitedPayload,
  FundsDebitRejected: FundsDebitRejectedPayload,
  FundsCredited: FundsCreditedPayload,
} as const satisfies Record<IntegrationEventType, z.ZodTypeAny>;

/** Payload tipado a partir do `type` da mensagem. */
export type PayloadFor<T extends IntegrationEventType> = z.infer<
  (typeof PAYLOAD_SCHEMA)[T]
>;

// ---- Envelope --------------------------------------------------------------

/**
 * Envelope genérico de toda mensagem de integração. `messageId` é a chave de
 * **idempotência** do consumidor (inbox dedup) — estável entre retries do relay, então
 * vem da `id` da linha da outbox, não é gerado a cada publish.
 */
export interface IntegrationMessage<T extends IntegrationEventType = IntegrationEventType> {
  readonly messageId: string;
  readonly type: T;
  readonly occurredAt: string;
  readonly payload: PayloadFor<T>;
}

/** Schema do envelope para um `type` concreto (valida `messageId`/`occurredAt` + payload). */
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

/**
 * Faz o parse de um corpo de mensagem cru (já `JSON.parse`-ado) validando o envelope contra
 * o schema do seu `type`. Lança `ZodError` se o contrato não bater (→ rejeita/DLQ).
 */
export function parseIntegrationMessage(raw: unknown): IntegrationMessage {
  const base = z
    .object({ type: z.nativeEnum(IntegrationEventType) })
    .parse(raw);
  return integrationMessageSchema(base.type).parse(raw);
}
