import { loadEnv } from "@crash-game/nestjs-kit";
import { z } from "zod";

export const walletsEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4002),
  DATABASE_URL: z.string().url(),

  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_JWKS_URI: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),

  // SQS/Valkey ainda NÃO são usados pela Wallet (saga é da Etapa 5). Declarados
  // como opcionais para não acoplar o bootstrap a infra não consumida; voltam a
  // obrigatórios quando os consumers/cache entrarem (Etapa 5).
  AWS_REGION: z.string().min(1).optional(),
  AWS_ENDPOINT: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  SQS_INBOX_QUEUE_URL: z.string().url().optional(),
  SQS_OUTBOUND_QUEUE_URL: z.string().url().optional(),

  VALKEY_URL: z.string().url().optional(),
});

export type WalletsEnv = z.infer<typeof walletsEnvSchema>;

export function loadWalletsEnv(): WalletsEnv {
  return loadEnv(walletsEnvSchema);
}
