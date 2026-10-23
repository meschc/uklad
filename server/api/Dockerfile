# Образ сервера заявок. Собирается из папки `server/` целиком: рядом с `api/`
# лежит `leads/` — разбор заявки и письмо, общие с облачной функцией.
#
#   docker build -f server/api/Dockerfile server
#
# Node 24 — LTS с встроенным SQLite (`node:sqlite`), без нативных сборок.
FROM node:24-alpine

ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1
WORKDIR /app

# nodemailer ставится один раз — для `leads/mail.js`, который ищет его рядом.
COPY leads/package.json leads/
RUN cd leads && npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY leads/lead.js leads/mail.js leads/
COPY api/package.json api/
COPY api/src api/src

# Не от root: взломанный процесс не должен получить контейнер целиком.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "api/src/server.js"]
