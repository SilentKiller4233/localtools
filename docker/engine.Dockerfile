# Layer 2 — Fastify engine.
# Phase 0: health endpoint only. Native tools (LibreOffice, Ghostscript,
# Tesseract, qpdf, WeasyPrint, yt-dlp, ffmpeg) are installed in later phases
# per PROJECT_SPEC Section 11; the resulting heavier image gets documented in
# README.md at that point.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tooling ./tooling
COPY packages/shared-types ./packages/shared-types
COPY apps/engine ./apps/engine
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @localtools/engine... build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /app/apps/engine/package.json ./apps/engine/package.json
COPY --from=build /app/apps/engine/dist ./apps/engine/dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>{if(!r.ok)throw 0}).catch(()=>process.exit(1))" || exit 1
CMD ["node", "apps/engine/dist/server.js"]
