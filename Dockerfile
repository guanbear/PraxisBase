FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @praxisbase/cli build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages ./packages
RUN pnpm install --prod --frozen-lockfile
ENTRYPOINT ["node", "/app/packages/cli/dist/index.js"]
