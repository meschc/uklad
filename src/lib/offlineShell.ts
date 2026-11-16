/**
 * Стол открывается и без сети (`public/app/sw.js`).
 *
 * Регистрируем воркер только на привязанном столе и только в сборке: у
 * кабинета руководителя правка без сервера всё равно не сохранится, а в
 * разработке воркер мешал бы горячей перезагрузке. Отвязанный стол воркер
 * снимает — компьютер снова обычный.
 */
export function enableOfflineShell(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined") return;
  const sw = navigator.serviceWorker;
  if (!sw) return;
  // Относительный путь: `/app/sw.js` на основном домене, `/sw.js` на поддомене.
  void sw
    .register(new URL("sw.js", window.location.href).pathname)
    .then(() => sw.ready)
    .then((reg) => {
      // Файлы, загруженные до того, как воркер начал управлять страницей,
      // через него не прошли: отдаём их список, чтобы и они были в кэше.
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      reg.active?.postMessage({ type: "cache", urls });
    })
    .catch(() => undefined);
}

export function disableOfflineShell(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined") return;
  void navigator.serviceWorker
    ?.getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => undefined);
}
