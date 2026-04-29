# ─────────────────────────────────────────────────────────────────────────
# CARPET indexer image
# Multi-stage build: install deps → compile TS → minimal runtime
# ─────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS deps
WORKDIR /app
# Copy workspace manifests so npm can resolve workspace links
COPY package.json package-lock.json* ./
COPY shared/package.json   ./shared/package.json
COPY indexer/package.json  ./indexer/package.json
COPY api/package.json      ./api/package.json
COPY ws/package.json       ./ws/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY shared  ./shared
COPY indexer ./indexer
RUN npm --workspace @carpet/indexer run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules           ./node_modules
COPY --from=build /app/shared                 ./shared
COPY --from=build /app/indexer/dist           ./indexer/dist
COPY --from=build /app/indexer/package.json   ./indexer/package.json
WORKDIR /app/indexer
CMD ["node", "dist/index.js"]
