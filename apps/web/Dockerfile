FROM node:22-alpine AS build

# Use corepack to activate pnpm (avoids npm install OOM on constrained builders)
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy monorepo workspace config from repo root context
COPY package.json pnpm-workspace.yaml .npmrc ./

# Copy all workspace packages (needed for workspace: protocol resolution)
COPY packages/ ./packages/

# Copy the web app source
COPY apps/web/ ./apps/web/

# Install only the web app's dependency tree
RUN pnpm install --filter @mighty-twin/web

# Build the web app
RUN pnpm --filter @mighty-twin/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
