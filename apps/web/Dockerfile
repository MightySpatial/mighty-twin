FROM node:22-alpine AS build

# Use corepack to activate pnpm (avoids npm install OOM on constrained builders)
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy monorepo workspace config + lockfile from repo root context
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Copy all workspace packages (needed for workspace: protocol resolution)
COPY packages/ ./packages/

# Copy the web app source
COPY apps/web/ ./apps/web/

# Full install so workspace packages (e.g. settings-panels) get their own
# transitive deps (react, @types/react) symlinked — needed for tsc to resolve
# imports when typechecking through workspace boundaries.
RUN pnpm install --frozen-lockfile

# Build the web app
RUN pnpm --filter @mighty-twin/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
