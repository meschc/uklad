import { describe, expect, it } from "vitest";
import { href, parsePath, routePath } from "../route";

/**
 * Разбор и сборка адресов витрины.
 *
 * Витрина переехала с хэша на настоящие пути, и цена ошибки здесь выросла:
 * раньше кривой разбор ломал переход внутри уже открытой страницы, теперь —
 * ссылку, которая лежит в поисковой выдаче и в чужих закладках. Проверяем обе
 * стороны, потому что они обязаны сходиться: то, что собрал `href`, должен
 * узнать `parsePath`.
 */
describe("parsePath", () => {
  it("узнаёт разделы витрины", () => {
    expect(parsePath("/market/")).toEqual({ page: "market", id: undefined });
    expect(parsePath("/pricing/")).toEqual({ page: "pricing", id: undefined });
    expect(parsePath("/legal/privacy/")).toEqual({ page: "legal", id: "privacy" });
  });

  it("считает лендингом корень сайта", () => {
    expect(parsePath("/")).toEqual({ page: "landing" });
    expect(parsePath("")).toEqual({ page: "landing" });
  });

  it("отдаёт «не найдено» на несуществующий раздел", () => {
    // Статический хостинг отвечает на любой адрес одной и той же страницей,
    // поэтому «нет такого раздела» решается только здесь. Иначе человек с
    // опечаткой в адресе увидит лендинг и решит, что нужной страницы у нас нет.
    expect(parsePath("/sklad/")).toEqual({ page: "notfound" });
    expect(parsePath("/blog/2024/")).toEqual({ page: "notfound" });
  });

  it("держит старый адрес склада внутри витрины", () => {
    // Склад раньше открывался поверх каталога и жил по `/market/w-12/`.
    // Перенаправить статикой нельзя — разбираем сами.
    expect(parsePath("/market/w-12/")).toEqual({ page: "warehouse", id: "w-12" });
    expect(parsePath("/warehouse/w-12/")).toEqual({ page: "warehouse", id: "w-12" });
  });

  it("отличает страницу для складов от карточки склада", () => {
    // Формы соседние и различаются одной буквой: `/warehouses/` — страница
    // «зачем это складу», `/warehouse/w-12/` — конкретный склад с витрины.
    // Перепутанный сегмент увёл бы склад на чужую страницу молча, без ошибки.
    expect(parsePath("/warehouses/")).toEqual({ page: "warehouses", id: undefined });
    expect(parsePath("/warehouse/w-12/")).toEqual({ page: "warehouse", id: "w-12" });
    expect(parsePath("/market/w-12/")).toEqual({ page: "warehouse", id: "w-12" });
  });

  it("отличает список документов от самого документа", () => {
    expect(parsePath("/legal/")).toEqual({ page: "legal", id: undefined });
  });

  it("не замечает языкового префикса", () => {
    // Язык снимается до маршрутизации: `/en/pricing/` — та же страница цен,
    // а не отдельный раздел, иначе английская версия целиком стала бы «404».
    expect(parsePath("/en/pricing/")).toEqual({ page: "pricing", id: undefined });
    expect(parsePath("/en/")).toEqual({ page: "landing" });
    expect(parsePath("/en/legal/offer/")).toEqual({ page: "legal", id: "offer" });
  });
});

describe("href", () => {
  it("собирает адрес с завершающей косой чертой", () => {
    // Слэш в конце — не украшение: без него хостинг отдаёт редирект на
    // вариант со слэшем, и каждая внутренняя ссылка стоит лишнего запроса.
    expect(href("/market", "ru")).toBe("/market/");
    expect(href("market", "ru")).toBe("/market/");
    expect(href("/legal/offer", "ru")).toBe("/legal/offer/");
  });

  it("корень остаётся корнем", () => {
    expect(href("/", "ru")).toBe("/");
    expect(href("", "ru")).toBe("/");
  });

  it("английская версия живёт под своим префиксом", () => {
    expect(href("/market", "en")).toBe("/en/market/");
    expect(href("/", "en")).toBe("/en/");
  });
});

describe("routePath", () => {
  it("возвращает путь, который узнаёт разбор", () => {
    // Это и есть переключатель языка: собрали путь текущей страницы, отдали
    // его `href` с другим языком — получили адрес той же страницы напротив.
    const cases = ["/market/", "/legal/offer/", "/warehouse/w-12/", "/pricing/", "/"];
    for (const path of cases) {
      const route = parsePath(path);
      expect(href(routePath(route), "ru")).toBe(path);
    }
  });

  it("несуществующая страница не получает адреса", () => {
    // У «404» нет канонического адреса — иначе поисковик получил бы указание
    // считать её главной.
    expect(routePath({ page: "notfound" })).toBe("");
  });
});
