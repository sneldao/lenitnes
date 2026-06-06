# LENITNES API — multi-stage build for Azure Container Apps
FROM node:20-alpine AS base
WORKDIR /app

# Copy root package files for workspace setup
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/types/src ./packages/types/src/

# Install dependencies (respects workspaces)
RUN npm ci --workspaces --if-present

# Copy source
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/
COPY packages/types/tsconfig.json ./packages/types/

# Build
RUN npm run build --workspace=@lenitnes/types
RUN npm run build --workspace=@lenitnes/api

# Production image
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/apps/api/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/api/package.json ./
EXPOSE 4000
CMD ["node", "dist/index.js"]
