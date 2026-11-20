/* global module */
"use strict";

/**
 * Строка без хвостовых «/». Циклом, а не `/\/+$/`: на строке из тысяч «/»
 * с другим символом в конце такое выражение работает за квадратичное время
 * (CodeQL js/polynomial-redos), а Origin и путь запроса присылает кто угодно.
 */
function trimSlashes(value) {
  const raw = String(value ?? "");
  let end = raw.length;
  while (end > 0 && raw[end - 1] === "/") end--;
  return raw.slice(0, end);
}

module.exports = { trimSlashes };
