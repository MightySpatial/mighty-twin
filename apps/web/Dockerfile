FROM node:20-alpine AS build
RUN npm install -g pnpm@9.15.0
WORKDIR /app
COPY ../../package.json ../../pnpm-workspace.yaml ../../.npmrc ./
COPY package.json ./apps/web/
RUN pnpm install --filter @mighty-twin/web --frozen-lockfile || pnpm install --filter @mighty-twin/web
COPY . ./apps/web/
RUN pnpm --filter @mighty-twin/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
