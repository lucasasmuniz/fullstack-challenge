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

  MESSAGING_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(true),
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  SQS_WAIT_TIME_SECONDS: z.coerce.number().int().min(0).max(20).default(20),
  SQS_MAX_MESSAGES: z.coerce.number().int().min(1).max(10).default(10),
  SQS_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),

  VALKEY_URL: z.string().url(),

  WS_CORS_ORIGIN: z.string().min(1).default("*"),

  OTEL_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(true),
  METRICS_PORT: z.coerce.number().int().positive().default(9465),
});

export type WalletsEnv = z.infer<typeof walletsEnvSchema>;

export function loadWalletsEnv(): WalletsEnv {
  return loadEnv(walletsEnvSchema);
}
