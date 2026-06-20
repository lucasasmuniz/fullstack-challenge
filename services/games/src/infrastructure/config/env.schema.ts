import { loadEnv } from "@crash-game/nestjs-kit";
import { z } from "zod";

export const gamesEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4001),
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

  // --- Engine / curva (Etapa 4) — timings e curva configuráveis, nada hardcoded ---
  CRASH_GROWTH_RATE: z.coerce.number().positive().default(0.06),
  BETTING_WINDOW_MS: z.coerce.number().int().positive().default(8000),
  TICK_INTERVAL_MS: z.coerce.number().int().positive().default(250),
  INTER_ROUND_DELAY_MS: z.coerce.number().int().nonnegative().default(3000),

  // --- Cadeia de seeds (provably fair) ---
  SEED_CHAIN_LENGTH: z.coerce.number().int().positive().default(100000),
  SEED_CHAIN_ROTATE_THRESHOLD: z.coerce.number().int().nonnegative().default(1000),
  SEED_BUFFER_SIZE: z.coerce.number().int().positive().default(50),
  SEED_BUFFER_LOW_WATERMARK: z.coerce.number().int().nonnegative().default(10),

  // --- Provably fair (house edge / teto) ---
  PROVABLY_FAIR_INSTANT_BUST_DIVISOR: z.coerce.number().int().positive().default(101),
  PROVABLY_FAIR_MAX_CRASH_X100: z.coerce.number().int().positive().default(1000000),

  // --- Scheduler (lease do líder) ---
  SCHEDULER_LEASE_TTL_MS: z.coerce.number().int().positive().default(10000),
  // Liga/desliga o engine nesta instância (false em testes que só querem auth/REST).
  SCHEDULER_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(true),

  // --- Beacon de entropia pública (provably fair anti-pré-computação — ADR 0017) ---
  BEACON_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(true),
  BEACON_BASE_URL: z.string().url().default("https://api.drand.sh"),
  BEACON_CHAIN_HASH: z
    .string()
    .min(1)
    .default("52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"),
  BEACON_ROUND_LEAD: z.coerce.number().int().positive().default(2),
  BEACON_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  BEACON_POLL_MAX_MS: z.coerce.number().int().nonnegative().default(20000),
});

export type GamesEnv = z.infer<typeof gamesEnvSchema>;

export function loadGamesEnv(): GamesEnv {
  return loadEnv(gamesEnvSchema);
}
