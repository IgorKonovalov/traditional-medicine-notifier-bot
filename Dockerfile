# NOTE: pin the base image by digest for reproducible, supply-chain-safe
# builds. Resolve the current digest on a machine with Docker and replace the
# tag in BOTH FROM lines below:
#   docker pull node:22-alpine
#   docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine
# Left as the mutable tag here because the digest can't be resolved in the
# build/CI sandbox without a registry pull.
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
# Corepack ships with node:22-alpine; it provisions the pnpm version pinned in
# package.json's `packageManager` field.
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm run build
# Slim node_modules to prod-only, then rebuild the one native dep so its binding
# is present in the tree copied into the runtime stage. `allowBuilds` (pnpm 11)
# authorizes better-sqlite3's build script.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && pnpm rebuild better-sqlite3

FROM node:22-alpine

# The node:22-alpine base image already ships a `node` user at uid/gid 1000;
# use it rather than creating a duplicate. This lets host bind-mounts owned by
# a uid-1000 deploy user line up without chmod-777 workarounds.

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY content/ ./content/
COPY package.json ./

RUN mkdir -p /app/data && chown -R node:node /app

USER node

# Liveness probe. The bot long-polls with no HTTP port, so health is read from
# the heartbeat file the process refreshes every 30s (see src/index.ts). A
# stale (>120s) or missing file → unhealthy. The start-period covers boot
# (migrations + content load). DB_PATH mirrors the app default.
HEALTHCHECK --interval=60s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const fs=require('fs'),p=require('path');const f=p.join(p.dirname(process.env.DB_PATH||'./data/tm-bot.db'),'heartbeat');process.exit(Date.now()-fs.statSync(f).mtimeMs<120000?0:1)"

CMD ["node", "dist/index.js"]
