# 多阶段构建：安装依赖 → 构建前后端 → 只含生产依赖的运行镜像
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/server/dist server/dist
# 迁移 SQL：启动时由 drizzle migrator 执行（见 server/src/db/prepare.ts）
COPY --from=build /app/server/drizzle server/drizzle
COPY --from=build /app/web/dist web/dist
ENV WEB_DIST_DIR=/app/web/dist
USER node
EXPOSE 3000
WORKDIR /app/server
CMD ["node", "dist/index.js"]
