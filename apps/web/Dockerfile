# Production image for the web (VPS). Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:3001 .
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# The /api proxy target is baked in at build time.
ARG API_URL=http://api:3001
ENV API_URL=$API_URL
RUN pnpm --filter @kollektor/web build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
