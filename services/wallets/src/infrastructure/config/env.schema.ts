import { loadEnv } from "@crash-game/nestjs-kit";
import { z } from "zod";

export const walletsEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4002),
  DATABASE_URL: z.string().url(),

  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_JWKS_URI: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),

  AWS_REGION: z.string().min(1),
  AWS_ENDPOINT: z.string().url(),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  SQS_INBOX_QUEUE_URL: z.string().url(),
  SQS_OUTBOUND_QUEUE_URL: z.string().url(),

  VALKEY_URL: z.string().url(),
});

export type WalletsEnv = z.infer<typeof walletsEnvSchema>;

export function loadWalletsEnv(): WalletsEnv {
  return loadEnv(walletsEnvSchema);
}
