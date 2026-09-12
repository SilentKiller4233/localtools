# Layer 2 — Fastify engine (PROJECT_SPEC Sections 5.4, 11).
#
# Multi-stage, minimal base, non-root, pinned native tools:
#   - Ghostscript (deep compress / PDF-A / deep repair, PDF render for OCR)
#   - Tesseract-OCR + English tessdata (OCR; OCRmyPDF rides with pip)
#   - LibreOffice (Office ↔ PDF conversion)
#   - ffmpeg (Media suite Group B — conversion/compress/trim/GIF/subtitles)
#   - WeasyPrint via pip (HTML→PDF) + GTK3 runtime (its native deps)
# Every native tool is invoked as a subprocess with argument arrays
# (Section 5.3); nothing here links against engine code.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY tooling ./tooling
COPY packages/shared-types ./packages/shared-types
# pdf-core: the engine's pdf-to-audiobook route imports its loadPdf/
# extractText (pure-TS, same package the client worker uses — D-031).
COPY packages/pdf-core ./packages/pdf-core
COPY apps/engine ./apps/engine
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @localtools/engine... build
# Prune to a self-contained production deploy of the engine (pnpm deploy
# resolves workspace deps into real files — the workspace node_modules
# symlinks don't survive a plain COPY of node_modules). --legacy: pnpm v10
# deploy otherwise requires inject-workspace-packages=true in the workspace.
# Deploy layout is FLAT: /pruned = { node_modules/, package.json, dist/, … }
# of the engine package alone (workspace deps resolved into node_modules).
RUN pnpm --filter @localtools/engine --prod --legacy deploy /pruned

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
# Native tools (all invoked as subprocesses with argument arrays —
# Section 5.3; nothing here links against engine code):
#   ghostscript, tesseract-ocr + eng, libreoffice, ffmpeg — apt
#   weasyprint + yt-dlp — pip (yt-dlp's pip wheel is the same code as
#   the official standalone exe; ~+40MB image impact, documented in
#   DECISIONS.md D-025 and README at Phase 14)
#   piper (TTS, Phase 9) — GitHub release tarball, SHA-256-pinned
#   (D-030: no upstream checksums — our pin is the verification).
#   The tarball extracts to piper/piper + its .so deps, installed at
#   /opt/piper (the tool-paths resolver checks /opt/piper/piper).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ghostscript \
    tesseract-ocr \
    tesseract-ocr-eng \
    libreoffice \
    ffmpeg \
    curl \
    ca-certificates \
    python3 \
    python3-pip \
  && pip3 install --no-cache-dir --break-system-packages weasyprint 'yt-dlp==2026.08.19' \
  && mkdir -p /opt/piper \
  && curl -fsSL -o /tmp/piper.tar.gz \
    'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz' \
  && echo 'a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992  /tmp/piper.tar.gz' | sha256sum -c - \
  && tar -xzf /tmp/piper.tar.gz -C /opt/piper --strip-components=1 \
  && rm /tmp/piper.tar.gz \
  && chmod +x /opt/piper/piper \
  && /opt/piper/piper --version \
  && apt-get purge -y python3-pip curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
# The runtime needs only `node` — the base image's bundled npm CLI (with
# its tar/pacote/sigstore/ip-address/... dependency tree) is pure attack
# surface: the Phase 13 Trivy gate found 11 HIGH/CRITICAL advisories in it
# (CVE-2026-59873 tar et al), all in npm's own node_modules, none in
# LocalTools deps. The engine runs `node dist/server.js`; nothing invokes
# npm at runtime. Removing it also cuts ~80MB from the image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# Flat deploy layout: the engine's own package.json + dist at /app root,
# deps (incl. @localtools/shared-types) inside node_modules.
COPY --from=build /pruned/node_modules ./node_modules
COPY --from=build /pruned/package.json ./package.json
COPY --from=build /pruned/dist ./dist
# Engine helper scripts: WeasyPrint launcher (Windows-only no-op here) and
# the opt-in Playwright PDF runner.
COPY apps/engine/scripts ./scripts
# Non-root, read-only-rootfs-friendly: temp work happens in /tmp (tmpfs in
# compose). Section 5.4 hardening flags live in docker-compose.yml.
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>{if(!r.ok)throw 0}).catch(()=>process.exit(1))" || exit 1
CMD ["node", "dist/server.js"]
