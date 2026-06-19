import { BadRequestException } from "@nestjs/common";
import { z, type ZodType } from "zod";

/** Valida input na borda com zod; falha → 400 (nunca confiar no cliente). */
export function parseOrBadRequest<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message),
    );
  }
  return result.data;
}

/**
 * Teto de um único movimento via REST. Limita bem abaixo do `MAX_SAFE_INTEGER`
 * (9e15) para que a conversão `number → bigint` na borda seja sempre exata (um
 * `number` "inteiro" porém não-safe perderia precisão antes de virar `bigint`) e
 * para barrar valores absurdos. 1e13 centavos = 100 bilhões na moeda.
 */
const MAX_AMOUNT_CENTS = 10_000_000_000_000;

/** Corpo de deposit/withdraw: centavos inteiros positivos (API usa `number`). */
export const amountBodySchema = z.object({
  amountCents: z
    .number({ message: "amountCents deve ser um número" })
    .int("amountCents deve ser inteiro")
    .positive("amountCents deve ser maior que zero")
    .max(MAX_AMOUNT_CENTS, "amountCents excede o máximo permitido"),
});

/** `Idempotency-Key` obrigatório e UUID. */
export const idempotencyKeySchema = z
  .string({ message: "Idempotency-Key é obrigatório" })
  .uuid("Idempotency-Key deve ser um UUID");
