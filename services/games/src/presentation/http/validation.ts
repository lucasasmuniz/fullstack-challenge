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

/** `1.00x` em ×100 — piso de um alvo de auto-cashout. */
const MIN_MULTIPLIER_X100 = 100;

/**
 * Corpo de `POST /bet`. `amountCents` inteiro positivo (limites de negócio min/max são
 * validados no domínio, com env). `autoCashoutTargetX100` é opcional (só guardado nesta
 * etapa; execução é B2/Etapa 7) e, se presente, inteiro > 1.00x.
 */
export const placeBetBodySchema = z.object({
  amountCents: z
    .number({ message: "amountCents deve ser um número" })
    .int("amountCents deve ser inteiro")
    .positive("amountCents deve ser maior que zero")
    // Mantém a conversão `number → bigint` exata na borda: um inteiro não-safe perderia
    // precisão antes de o domínio validar min/max (limites de negócio ficam no domínio).
    .max(Number.MAX_SAFE_INTEGER, "amountCents excede o máximo permitido"),
  autoCashoutTargetX100: z
    .number()
    .int("autoCashoutTargetX100 deve ser inteiro")
    .gt(MIN_MULTIPLIER_X100, "autoCashoutTargetX100 deve ser maior que 1.00x")
    .nullish(),
});

export type PlaceBetBody = z.infer<typeof placeBetBodySchema>;

/**
 * Path param `:id` de `/rounds/:id/verify`. A coluna `round.id` é `uuid`; sem validar, um id
 * não-UUID chega cru ao Postgres (`invalid input syntax for type uuid`) e vira 500 numa rota
 * **pública**. Validar na borda converte isso em 400 (igual ao resto da camada).
 */
export const roundIdParamSchema = z
  .string({ message: "id da rodada é obrigatório" })
  .uuid("id da rodada deve ser um UUID");
