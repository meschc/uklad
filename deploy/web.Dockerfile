# Витрина и кабинет: сборка сайта и Caddy, который его отдаёт.
#
#   docker build -f deploy/web.Dockerfile .
#
# Сайт собирается внутри образа, а не на машине Кирилла: на сервере нужен
# только Docker, Node ставить не придётся.

# --- сборка ---
FROM node:26-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Форма шлёт заявку на тот же домен: Caddy передаст `/api/*` серверу. Адрес
# относительный, поэтому один и тот же образ работает и на u-klad.ru, и на
# проверочном домене.
ENV VITE_LEADS_ENDPOINT=/api/leads
RUN npm run build

# --- раздача ---
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
