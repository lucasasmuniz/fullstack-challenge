import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes do monorepo exportam TS de `src/` — o Next precisa transpilá-los.
  transpilePackages: ["@crash-game/curve", "@crash-game/realtime-contracts"],
};

export default nextConfig;
