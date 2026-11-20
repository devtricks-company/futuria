# FUTURIA API image. Build it from the repo root, because the API needs packages/shared and
# packages/engine:
#
#   docker build -f apps/api/Dockerfile .
#
# CI builds and publishes it (.github/workflows/deploy-api-staging.yml); see docs/DEPLOY.md.
# Secrets never enter the image: .dockerignore drops every .env file, and the host injects them.

FROM node:24-slim AS build
ENV CI=true
# The same pnpm as "packageManager" in package.json.
RUN npm install -g pnpm@11.24.0
WORKDIR /repo
COPY . .
# Install and build only the API and the workspace packages it uses (shared, engine, config).
RUN pnpm install --frozen-lockfile --filter "@futuria/api..."
RUN pnpm --filter "@futuria/api..." run build
# Keep production dependencies only. The app runs inside the workspace so its workspace:* links
# to packages/*/dist keep working (`pnpm deploy` would drop dist, which is gitignored).
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --prod --filter "@futuria/api..."

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
