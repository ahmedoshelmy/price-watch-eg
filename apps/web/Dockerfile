# Build context: repository root (npm workspaces share one lockfile).
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund -w @price-watch/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build -w @price-watch/web

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
