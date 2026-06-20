// Side-effect: define as envs ANTES de qualquer import do AppModule (que valida
// env no carregamento, fail-fast). Importado primeiro no teste; a ordem dos
// imports ESM garante que isto roda antes do AppModule ser avaliado.
function setDefault(key: string, value: string): void {
  process.env[key] ??= value;
}

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";

// Banco ISOLADO para e2e (wallets_test) — não polui o `wallets` de dev/demo. As migrations
// (schema + seed do player) rodam nele no beforeAll de cada teste.
setDefault("DATABASE_URL", "postgresql://admin:admin@localhost:5432/wallets_test");
setDefault("KEYCLOAK_ISSUER", `${KEYCLOAK_URL}/realms/crash-game`);
setDefault(
  "KEYCLOAK_JWKS_URI",
  `${KEYCLOAK_URL}/realms/crash-game/protocol/openid-connect/certs`,
);
setDefault("KEYCLOAK_CLIENT_ID", "crash-game-client");
setDefault("AWS_REGION", "us-east-1");
setDefault("AWS_ENDPOINT", "http://localhost:4566");
setDefault("AWS_ACCESS_KEY_ID", "test");
setDefault("AWS_SECRET_ACCESS_KEY", "test");
setDefault(
  "SQS_INBOX_QUEUE_URL",
  "http://localhost:4566/000000000000/wallet-inbox",
);
setDefault(
  "SQS_OUTBOUND_QUEUE_URL",
  "http://localhost:4566/000000000000/game-inbox",
);
setDefault("VALKEY_URL", "redis://localhost:6379");
// Testes que sobem o AppModule não devem ligar os loops de SQS (consumer/relay).
setDefault("MESSAGING_ENABLED", "false");

export {};
