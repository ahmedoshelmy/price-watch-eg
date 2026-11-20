# One image recipe for the three Node services (APP = api | checker | scraper). Build context: repository root.
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
ARG APP
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
# Every workspace manifest, so `npm ci` can verify the lockfile; only the needed workspaces get installed.
COPY libs/contracts/package.json libs/contracts/
COPY libs/platform/package.json libs/platform/
COPY apps/api/package.json apps/api/
COPY apps/checker/package.json apps/checker/
COPY apps/scraper/package.json apps/scraper/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund --ignore-scripts -w @price-watch/contracts -w @price-watch/platform -w @price-watch/${APP} --include-workspace-root
COPY libs libs
COPY apps/${APP} apps/${APP}
RUN npm run build -w @price-watch/contracts -w @price-watch/platform -w @price-watch/${APP}

FROM ${NODE_IMAGE} AS deps
ARG APP
WORKDIR /repo
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/libs/contracts/package.json libs/contracts/
COPY --from=build /repo/libs/platform/package.json libs/platform/
COPY --from=build /repo/apps apps
RUN npm ci --no-audit --no-fund --ignore-scripts --omit=dev -w @price-watch/contracts -w @price-watch/platform -w @price-watch/${APP} \
      --include-workspace-root=false \
 && mkdir -p apps/${APP}/node_modules

# The real scraper library, pinned: cloned from its public repo at a fixed commit and built (it is not on npm).
FROM ${NODE_IMAGE} AS scraper-lib
ARG SCRAPER_LIB_COMMIT=f7bfb67f02be5466ab91cc337386129c5ab71b89
RUN apk add --no-cache git
WORKDIR /opt/egypt-price-scraper
RUN git clone https://github.com/ahmedoshelmy/egypt-price-scraper.git . && git checkout ${SCRAPER_LIB_COMMIT} \
 && npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE} AS service
ARG APP
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=deps /repo/node_modules node_modules
COPY --from=build /repo/libs/contracts/package.json libs/contracts/
COPY --from=build /repo/libs/contracts/dist libs/contracts/dist
COPY --from=build /repo/libs/contracts/proto libs/contracts/proto
COPY --from=build /repo/libs/platform/package.json libs/platform/
COPY --from=build /repo/libs/platform/dist libs/platform/dist
COPY --from=build /repo/apps/${APP}/package.json apps/${APP}/
# Packages npm could not hoist (version clashes) stay next to their workspace.
COPY --from=deps /repo/apps/${APP}/node_modules apps/${APP}/node_modules
COPY --from=build /repo/apps/${APP}/dist apps/${APP}/dist
WORKDIR /repo/apps/${APP}
USER node
CMD ["node", "dist/main.js"]

FROM service AS scraper
COPY --from=scraper-lib /opt/egypt-price-scraper/package.json /repo/node_modules/egypt-price-scraper/package.json
COPY --from=scraper-lib /opt/egypt-price-scraper/dist /repo/node_modules/egypt-price-scraper/dist
