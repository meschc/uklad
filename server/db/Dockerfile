# Разовый контейнер миграций: при каждой выкладке применяет недостающие
# `migrations/NNN_*.sql` под владельцем таблиц (uklad_owner) и завершается.
# api стартует только после его успешного выхода (deploy/compose.yml).
#
#   docker build -f server/db/Dockerfile server/db
FROM node:24-alpine

ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src src
COPY migrations migrations

USER node
CMD ["node", "src/migrate.js"]
