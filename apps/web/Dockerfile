FROM node:22-alpine AS build
RUN npm install -g pnpm@9.15.0
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig*.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mighty-twin/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
