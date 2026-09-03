# Layer 1 — Vite build, then serve static via unprivileged nginx.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY tooling ./tooling
COPY packages ./packages
COPY apps/client ./apps/client
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @localtools/client... build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
