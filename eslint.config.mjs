import config from "@crash-game/eslint-config";

// O frontend tem sua própria toolchain ESLint (eslint-config-next, sem typed linting) e é lintado
// à parte (`cd frontend && bun run lint`). Ignorado aqui para o typed linting da raiz não tentar
// resolver os .ts/.tsx do frontend (que não estão no tsconfig do backend) nem varrer o .next/.
export default [{ ignores: ["frontend/**"] }, ...config];
