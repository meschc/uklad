/**
 * Ссылка-приглашение из письма: `/app/#invite=<токен>`. Токен во фрагменте
 * адреса не уходит на сервер вместе со страницей и не попадает в его журналы.
 */
/** Токен приглашения из адреса, если он там есть. */
export function inviteTokenFromUrl(hash = window.location.hash): string | null {
  const m = /^#invite=([A-Za-z0-9_-]{43})$/.exec(hash);
  return m ? m[1] : null;
}
