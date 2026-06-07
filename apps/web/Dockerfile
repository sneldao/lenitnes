# LENITNES Web — Next.js (webpack build), served with `next start`.
FROM node:20-alpine AS base
WORKDIR /app

# Copy every workspace manifest so `npm ci` matches the lockfile exactly.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/types/tsconfig.json ./packages/types/
COPY packages/types/src ./packages/types/src/

# Husky git hooks are irrelevant in Docker; drop the prepare hook before install.
RUN npm pkg delete scripts.prepare
RUN npm ci

# Build shared types first (web imports @lenitnes/types)
RUN npm run build --workspace=@lenitnes/types

# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, so they
# must be present here as build args (not just runtime env).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_HASHCONNECT_PROJECT_ID
ARG NEXT_PUBLIC_HEDERA_NETWORK
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_HASHCONNECT_PROJECT_ID=$NEXT_PUBLIC_HASHCONNECT_PROJECT_ID \
    NEXT_PUBLIC_HEDERA_NETWORK=$NEXT_PUBLIC_HEDERA_NETWORK

# Web source + build
COPY apps/web ./apps/web
RUN npm run build --workspace=@lenitnes/web

# ── Production image ──────────────────────────────────────────
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/web/.next ./apps/web/.next
COPY --from=base /app/apps/web/package.json ./apps/web/
COPY --from=base /app/apps/web/next.config.mjs ./apps/web/

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
