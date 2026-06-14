# Soul API — Railway image (build context = repo root; see railway.toml).
#
# The workspace is pnpm-managed but the API RUNTIME is Bun (CLAUDE.md §3), so the image carries
# both: Node 22 + corepack for the pnpm install, Bun (pinned — decision #10) to run the server.
#
# NODE_ENV=production is LOAD-BEARING and baked in here: it disables dev-login (impersonation),
# refuses mock adapters at boot, and hides error internals. Never remove it.

FROM node:22-slim

# Bun installer needs curl + unzip + certs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

# Pin Bun (matches the version the service was verified against; bump deliberately).
# NOTE: must be ≥1.2.17 — older Bun lacks process.getBuiltinModule, which pdfjs-dist needs.
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.2.17"
ENV PATH="/root/.bun/bin:${PATH}"

# pnpm via corepack, pinned by the root package.json `packageManager` field.
RUN corepack enable

WORKDIR /app
COPY . .

# Install only the API's dependency closure (skips the Next.js web app entirely).
RUN pnpm install --frozen-lockfile --filter "@soul/api..."

ENV NODE_ENV=production
WORKDIR /app/apps/api

# Railway injects PORT; src/pkg/config.ts reads it (defaults to 3004 locally).
EXPOSE 3004
CMD ["bun", "run", "src/index.ts"]
