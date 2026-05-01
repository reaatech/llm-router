FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-alpine AS runtime

WORKDIR /app

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

USER nodejs

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node packages/engine/dist/health-check.cjs || exit 1

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
