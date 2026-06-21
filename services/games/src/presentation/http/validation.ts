import { BadRequestException } from "@nestjs/common";
import { z, type ZodType } from "zod";
import { AutoBetStrategy } from "../../domain";

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
 * etapa; execução é runtime) e, se presente, inteiro > 1.00x.
 */
export const placeBetBodySchema = z.object({
  amountCents: z
    .number({ message: "amountCents deve ser um número" })
    .int("amountCents deve ser inteiro")
    .positive("amountCents deve ser maior que zero")
    .max(Number.MAX_SAFE_INTEGER, "amountCents excede o máximo permitido"),
  autoCashoutTargetX100: z
    .number()
    .int("autoCashoutTargetX100 deve ser inteiro")
    .gt(MIN_MULTIPLIER_X100, "autoCashoutTargetX100 deve ser maior que 1.00x")
    .nullish(),
});

export type PlaceBetBody = z.infer<typeof placeBetBodySchema>;

/**
 * Corpo de `POST /autobet`. Centavos inteiros positivos (limites de negócio min/max e
 * regras — budget ≥ base, stop-loss > 0 — ficam no domínio). `stopWinCents`/`maxRounds`
 * opcionais. `strategy` valida contra o enum de domínio.
 */
const safeIntCents = z
  .number()
  .int("deve ser inteiro")
  .positive("deve ser maior que zero")
  .max(Number.MAX_SAFE_INTEGER, "excede o máximo permitido");

export const autoBetBodySchema = z.object({
  strategy: z.nativeEnum(AutoBetStrategy),
  baseAmountCents: safeIntCents,
  autoCashoutTargetX100: z
    .number()
    .int("autoCashoutTargetX100 deve ser inteiro")
    .gt(MIN_MULTIPLIER_X100, "autoCashoutTargetX100 deve ser maior que 1.00x"),
  stopLossCents: safeIntCents,
  budgetCents: safeIntCents,
  stopWinCents: safeIntCents.nullish(),
  maxRounds: z.number().int().positive("maxRounds deve ser > 0").nullish(),
});

export type AutoBetBody = z.infer<typeof autoBetBodySchema>;

/**
 * Path param `:id` de `/rounds/:id/verify`. A coluna `round.id` é `uuid`; sem validar, um id
 * não-UUID chega cru ao Postgres (`invalid input syntax for type uuid`) e vira 500 numa rota
 * **pública**. Validar na borda converte isso em 400 (igual ao resto da camada).
 */
export const roundIdParamSchema = z
  .string({ message: "id da rodada é obrigatório" })
  .uuid("id da rodada deve ser um UUID");

/** Query `?period=` do leaderboard. O controller aplica o default `24h` antes de validar. */
export const leaderboardPeriodSchema = z.enum(["24h", "week"], {
  message: "period deve ser '24h' ou 'week'",
});
