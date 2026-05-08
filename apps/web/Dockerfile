FROM node:22-alpine AS build

# Install pnpm via npm (reliable on all Railway builders)
RUN npm install -g pnpm@9.15.0

WORKDIR /app

# Copy monorepo workspace config + lockfile + root tsconfigs from repo root.
# Workspace packages extend ../../tsconfig.base.json — vite/esbuild needs it
# resolvable when bundling through workspace boundaries.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig*.json ./

# Copy all workspace packages (needed for workspace: protocol resolution)
COPY packages/ ./packages/

# Copy the web app sourc
COPY ./apps/web/ ./apps/web/

# Full install so workspace packages (e.g. settings-panels) get their own
# transitive deps (react, @types/react) symlinked — needed for tsc to resolve
# imports when typechecking through workspace boundaries.
RUN pnpm install --frozen-lockfile

# Build the web app
RUN pnpm --filter @mighty-twin/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Vite emits to dist/ with base='/viewer/' as a URL prefix only — the
# on-disk layout is still flat (index.html, assets/, cesium/, favicons,
# …). Move every dist entry under viewer/ so paths line up with what
# the bundle and the SPA router request.
RUN mkdir -p /usr/share/nginx/html/viewer \
    && find /usr/share/nginx/html -maxdepth 1 -mindepth 1 \
        ! -name viewer \
        -exec mv {} /usr/share/nginx/html/viewer/ \;

# SPA fallback under /viewer/ + redirect / → /viewer/.
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
