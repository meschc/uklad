/* global self, caches, fetch, URL, Response */
/**
 * Оболочка стола без сети (`src/lib/offlineShell.ts` регистрирует его только
 * на привязанном столе).
 *
 * Без него перезагрузка при обрыве связи показывала ошибку браузера, хотя
 * работа стола живёт в браузере: снимок и очередь операций сохранены, сканы
 * уходят сами, когда связь вернётся. Теперь страница и её файлы берутся из
 * кэша, если сети нет.
 *
 *  · Страница — сначала сеть: со связью стол всегда получает свежую сборку,
 *    кэш нужен, только когда сети нет.
 *  · Файлы сборки (`/assets/…`) — сначала кэш: имена с хэшем, файл под
 *    именем не меняется никогда.
 *  · Сервер (`/api/…`, чат) не кэшируется вовсе: данные — только живые,
 *    очередь операций повторяет запросы сама.
 */
const SHELL = "uklad-desk-shell-v1";
const ASSETS = "uklad-desk-assets-v1";
/** Сколько файлов сборки держать: старые сборки после выкладок не копятся. */
const MAX_ASSETS = 300;

// Страница, которой управляет воркер, — каталог, где он лежит: `/app/` на
// основном домене, `/` на поддомене кабинета.
const PAGE = new URL("./", self.location.href).pathname;

const isAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/fonts/") ||
    /^\/(favicon\.(svg|ico)|apple-touch-icon\.png)$/.test(url.pathname));

/** Файлы, на которые ссылается страница: их кэшируем сразу при установке. */
function linkedAssets(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
    if (isAsset(new URL(m[1], self.location.origin))) out.add(m[1]);
  }
  return [...out];
}

async function cacheShell() {
  const res = await fetch(PAGE, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await (await caches.open(SHELL)).put(PAGE, res);
  const assets = await caches.open(ASSETS);
  await Promise.all(
    linkedAssets(html).map((path) =>
      assets.match(path).then((hit) => hit || assets.add(path).catch(() => undefined)),
    ),
  );
}

async function trimAssets() {
  const cache = await caches.open(ASSETS);
  const keys = await cache.keys();
  // `keys()` — в порядке добавления: старые сборки уходят первыми.
  const extra = keys.slice(0, Math.max(0, keys.length - MAX_ASSETS));
  await Promise.all(extra.map((k) => cache.delete(k)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith("uklad-desk-") && n !== SHELL && n !== ASSETS)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Страница присылает файлы, которые уже загрузила до того, как воркер начал
// ею управлять (первый заход), — в том числе части, подгруженные позже.
self.addEventListener("message", (event) => {
  const urls = event.data && event.data.type === "cache" ? event.data.urls : null;
  if (!Array.isArray(urls)) return;
  event.waitUntil(
    caches.open(ASSETS).then((cache) =>
      Promise.all(
        urls
          .map((u) => new URL(u, self.location.origin))
          .filter(isAsset)
          .map((u) =>
            cache.match(u.pathname).then((hit) => hit || cache.add(u.pathname).catch(() => {})),
          ),
      ).then(trimAssets),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate" && url.origin === self.location.origin && url.pathname === PAGE) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL).then((c) => c.put(PAGE, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .open(SHELL)
            .then((c) => c.match(PAGE))
            .then((hit) => hit || Response.error()),
        ),
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSETS).then((cache) =>
        cache.match(url.pathname).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) void cache.put(url.pathname, res.clone()).then(trimAssets);
              return res;
            }),
        ),
      ),
    );
  }
});
