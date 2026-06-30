# LENITNES API — multi-stage workspace build.
FROM node:20-alpine AS base
WORKDIR /app

# Copy every workspace manifest so `npm ci` matches the lockfile exactly.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/types/tsconfig.json ./packages/types/
COPY packages/types/src ./packages/types/src/

# Husky git hooks are irrelevant in Docker; drop the prepare hook before install.
# Plain `npm ci` (no --workspaces) installs the FULL tree, including the root
# package's own dependencies (pg, node-cron) which --workspaces would skip.
RUN npm pkg delete scripts.prepare
RUN npm ci

# Copy source
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/

# Build
RUN npm run build --workspace=@lenitnes/types
RUN npm run build --workspace=@lenitnes/api

# ── Production image ──────────────────────────────────────────
FROM node:20-slim AS prod
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/apps/api/dist ./dist
# Copy every rubric .md into the image so RUBRIC_PATH bumps (agent.ts
# points at the active file) don't require a Dockerfile edit. Only the
# .md prompts are needed — the .ts sources are compiled into dist/.
COPY --from=base /app/apps/api/src/services/agent/*.md ./dist/services/agent/
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/api/package.json ./
# @hashgraph/sdk, @x402/axios, @x402/evm, and axios are root deps in package.json
# so npm ci installs them. The root-level install ensures ESM resolution from /app/dist works.
EXPOSE 8742
CMD ["node", "dist/index.js"]
