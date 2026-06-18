# Build a partir da RAIZ do monorepo (context: .) para resolver os pacotes @crash-game/* do workspace.
FROM oven/bun:1-alpine

WORKDIR /app

# Manifests de TODOS os membros do workspace primeiro — o bun.lock descreve o
# workspace inteiro, então o --frozen-lockfile exige todos os package.json presentes.
COPY package.json bun.lock ./
COPY packages ./packages
COPY services/games/package.json ./services/games/package.json
COPY services/wallets/package.json ./services/wallets/package.json

# Instala o workspace inteiro (cria os symlinks de @crash-game/* em node_modules).
RUN bun install --frozen-lockfile

# Código do serviço.
COPY services/wallets ./services/wallets

# WORKDIR no diretório do serviço: o Bun lê o tsconfig.json a partir do cwd
# (precisa do experimentalDecorators do serviço); o node_modules resolve pra cima em /app.
WORKDIR /app/services/wallets

EXPOSE 4002

CMD ["bun", "run", "src/main.ts"]
