# Build a partir da RAIZ do monorepo (context: .) para resolver os pacotes @crash-game/* do workspace.
# Multi-stage: builder (instala + next build standalone) → runner enxuto (só o output standalone).
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Manifests de todos os membros do workspace (o --frozen-lockfile exige todos presentes).
COPY package.json bun.lock ./
COPY packages ./packages
COPY services/games/package.json ./services/games/package.json
COPY services/wallets/package.json ./services/wallets/package.json
COPY frontend/package.json ./frontend/package.json
RUN bun install --frozen-lockfile

# Código dos pacotes compartilhados (curve/realtime-contracts) + frontend.
COPY packages ./packages
COPY frontend ./frontend

WORKDIR /app/frontend
# As NEXT_PUBLIC_* são embutidas no build; os defaults (Kong em localhost:8000) servem o dev local.
RUN bun run build

# --- Runner: imagem mínima com o output standalone ---
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# O standalone empacota o server + node_modules mínimos; static e public vão à parte.
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public

EXPOSE 3000
CMD ["bun", "frontend/server.js"]
