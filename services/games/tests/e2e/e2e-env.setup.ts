// Side-effect: define as envs ANTES de qualquer import do AppModule (que valida
// env no carregamento, fail-fast). Importado primeiro no teste; a ordem dos
// imports ESM garante que isto roda antes do AppModule ser avaliado.
function setDefault(key: string, value: string): void {
  process.env[key] ??= value;
}

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";

// Banco ISOLADO para e2e (games_test) — não polui o `games` de dev/demo. As migrations
// rodam nele no beforeAll de cada teste.
setDefault("DATABASE_URL", "postgresql://admin:admin@localhost:5432/games_test");
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
  "http://localhost:4566/000000000000/game-inbox",
);
setDefault(
  "SQS_OUTBOUND_QUEUE_URL",
  "http://localhost:4566/000000000000/wallet-inbox",
);
setDefault("VALKEY_URL", "redis://localhost:6379");
// Testes que sobem o AppModule (ex.: auth) NÃO devem ligar o engine nem bater no beacon
// externo (M5/isolamento). Os testes de engine instanciam os componentes diretamente.
setDefault("SCHEDULER_ENABLED", "false");
setDefault("BEACON_ENABLED", "false");

export {};
