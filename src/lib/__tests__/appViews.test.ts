import { describe, expect, test } from "vitest";
import { APP_VIEWS, deepLinkSearch, isHeatmapWindow, parseDeepLink } from "../appViews";

/**
 * Прямая ссылка на экран системы. Разбор адреса — единственное место, где
 * приложение вообще смотрит в URL, и ошибиться здесь дорого: кривая ссылка не
 * должна ни ронять запуск, ни утаскивать человека с того экрана, где он
 * остановился в прошлый раз.
 */
describe("parseDeepLink", () => {
  test("возвращает пустую ссылку, когда параметров нет", () => {
    expect(parseDeepLink("")).toEqual({ role: null, view: null });
    expect(parseDeepLink("?heatmap=1")).toEqual({ role: null, view: null });
  });

  test("читает экран", () => {
    expect(parseDeepLink("?view=receiving")).toEqual({
      role: null,
      view: "receiving",
    });
  });

  test("читает роль вместе с экраном", () => {
    expect(parseDeepLink("?role=seller&view=seller")).toEqual({
      role: "seller",
      view: "seller",
    });
  });

  test("незнакомый экран игнорирует, а не роняет запуск", () => {
    expect(parseDeepLink("?view=sklad")).toEqual({ role: null, view: null });
    expect(parseDeepLink("?view=")).toEqual({ role: null, view: null });
  });

  test("незнакомую роль игнорирует, экран из той же ссылки оставляет", () => {
    expect(parseDeepLink("?role=admin&view=tasks")).toEqual({
      role: null,
      view: "tasks",
    });
  });

  test("не путается в соседних параметрах", () => {
    expect(parseDeepLink("?heatmap=1&view=editor&utm_source=map")).toEqual({
      role: null,
      view: "editor",
    });
  });

  test("знает все экраны приложения", () => {
    // Список экранов дублирует тип AppView: типы до рантайма не доживают, а
    // проверять параметр адреса нужно именно в рантайме. Если экран добавили
    // в тип и забыли здесь, ссылка на него молча перестанет работать.
    expect(APP_VIEWS).toContain("dashboard");
    expect(APP_VIEWS).toContain("seller");
    expect(new Set(APP_VIEWS).size).toBe(APP_VIEWS.length);
  });
});

/**
 * Обратная сборка адреса. Проверяется главным образом сохранность чужих
 * параметров: на них держится и отдельное окно тепловой карты, и учёт того,
 * откуда человек пришёл.
 */
describe("deepLinkSearch", () => {
  test("пишет роль и экран", () => {
    expect(deepLinkSearch("", { role: "seller", view: "receiving" })).toBe(
      "?role=seller&view=receiving",
    );
  });

  test("переписывает то, что уже стояло в адресе", () => {
    expect(deepLinkSearch("?role=warehouse&view=tasks", { role: "seller", view: "seller" })).toBe(
      "?role=seller&view=seller",
    );
  });

  test("не трогает чужие параметры", () => {
    const search = deepLinkSearch("?heatmap=1&utm_source=map", {
      role: null,
      view: "editor",
    });
    expect(new URLSearchParams(search).get("heatmap")).toBe("1");
    expect(new URLSearchParams(search).get("utm_source")).toBe("map");
    expect(new URLSearchParams(search).get("view")).toBe("editor");
  });

  test("пустую ссылку убирает из адреса вместе с `?`", () => {
    expect(deepLinkSearch("?role=seller&view=tasks", { role: null, view: null })).toBe("");
  });

  test("читается обратно тем же разбором", () => {
    const link = { role: "warehouse", view: "labels" } as const;
    expect(parseDeepLink(deepLinkSearch("", link))).toEqual(link);
  });
});

describe("isHeatmapWindow", () => {
  test("узнаёт окно тепловой карты по признаку в адресе", () => {
    expect(isHeatmapWindow("?heatmap=1")).toBe(true);
    expect(isHeatmapWindow("?view=editor")).toBe(false);
    expect(isHeatmapWindow("")).toBe(false);
  });
});
