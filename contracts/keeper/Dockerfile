FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY target/idl/launchpad.json target/idl/launchpad.json
COPY scripts/keeper_auto_migrate.js scripts/keeper_buyback.js scripts/keeper_claim_lp_fees.js scripts/
COPY keeper/run.sh run.sh
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["bash", "run.sh"]
