import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // Pacotes do monorepo exportam TS de `src/` — o Next precisa transpilá-los.
  transpilePackages: ["@crash-game/curve", "@crash-game/realtime-contracts"],
  // Build standalone (Docker enxuto). Raiz de tracing = raiz do monorepo (resolve os workspaces).
  output: "standalone",
  outputFileTracingRoot: join(import.meta.dirname, ".."),
};

export default nextConfig;
