FROM node:20-alpine AS deps
WORKDIR /app
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
COPY shared ./shared
COPY api    ./api
RUN npm --workspace @carpet/shared run build
RUN npm --workspace @carpet/api run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules            ./node_modules
COPY --from=build /app/shared/dist             ./shared/dist
COPY --from=build /app/shared/package.json     ./shared/package.json
COPY --from=build /app/api/dist                ./api/dist
COPY --from=build /app/api/package.json        ./api/package.json
WORKDIR /app/api
EXPOSE 3000
CMD ["node", "dist/index.js"]