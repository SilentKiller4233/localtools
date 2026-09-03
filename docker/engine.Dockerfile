# Layer 2 — Fastify engine (PROJECT_SPEC Sections 5.4, 11).
#
# Multi-stage, minimal base, non-root, pinned native tools:
#   - Ghostscript (deep compress / PDF-A / deep repair, PDF render for OCR)
#   - Tesseract-OCR + English tessdata (OCR; OCRmyPDF rides with pip)
#   - LibreOffice (Office ↔ PDF conversion)
#   - WeasyPrint via pip (HTML→PDF) + GTK3 runtime (its native deps)
# Every native tool is invoked as a subprocess with argument arrays
# (Section 5.3); nothing here links against engine code.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY tooling ./tooling
COPY packages/shared-types ./packages/shared-types
COPY apps/engine ./apps/engine
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @localtools/engine... build
# Prune to a self-contained production deploy of the engine (pnpm deploy
# resolves workspace deps into real files — the workspace node_modules
# symlinks don't survive a plain COPY of node_modules).
RUN pnpm --filter @localtools/engine --prod deploy /pruned

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ghostscript \
    tesseract-ocr \
    tesseract-ocr-eng \
    libreoffice \
    python3 \
    python3-pip \
  && pip3 install --no-cache-dir --break-system-packages weasyprint \
  && apt-get purge -y python3-pip \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /pruned/node_modules ./node_modules
COPY --from=build /pruned/package.json ./package.json
COPY --from=build /pruned/apps/engine/package.json ./apps/engine/package.json
COPY --from=build /pruned/apps/engine/dist ./apps/engine/dist
COPY --from=build /pruned/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /pruned/packages/shared-types/dist ./packages/shared-types/dist
# Engine helper scripts: WeasyPrint launcher (Windows-only no-op here) and
# the opt-in Playwright PDF runner.
COPY apps/engine/scripts ./apps/engine/scripts
# Non-root, read-only-rootfs-friendly: temp work happens in /tmp (tmpfs in
# compose). Section 5.4 hardening flags live in docker-compose.yml.
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>{if(!r.ok)throw 0}).catch(()=>process.exit(1))" || exit 1
CMD ["node", "apps/engine/dist/server.js"]
