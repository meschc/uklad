import { describe, expect, it } from "vitest";
import { LEGAL_DOCS } from "../../data/legal";
import { WAREHOUSES } from "../../data/warehouses";
import { pageMeta } from "../pageMeta";
import { buildSitemap, SITE_ROUTES } from "../routes";

/**
 * Шапка документа и список адресов.
 *
 * Проверять их тестом стоит по той же причине, по какой их вообще вынесли из
 * компонента: эти строки читает не человек, а поисковик, и ошибку в них не
 * видно ни на одном экране. Ровно так и прошла мимо глаз первая версия
 * `pageMeta`, где условие «страницы нет» срабатывало на любой адрес с
 * идентификатором: все семьдесят документов и складов уходили в сборку с
 * запретом индексации, и выглядели они при этом совершенно нормально.
 */
describe("pageMeta", () => {
  it("открывает для индексации существующие склады и документы", () => {
    const w = pageMeta({ page: "warehouse", id: WAREHOUSES[0].id }, "ru");
    expect(w.noindex).toBe(false);
    expect(w.ru).toBe(`/warehouse/${WAREHOUSES[0].id}/`);

    const doc = pageMeta({ page: "legal", id: LEGAL_DOCS[0].slug }, "ru");
    expect(doc.noindex).toBe(false);
    expect(doc.ru).toBe(`/legal/${LEGAL_DOCS[0].slug}/`);
  });

  it("закрывает несуществующий адрес и не даёт ему канонического", () => {
    // Канонический адрес — утверждение «вот настоящий адрес этой страницы».
    // У страницы, которой нет, его быть не может: указав корень, мы бы
    // попросили поисковик считать главной каждую опечатку в ссылке.
    const w = pageMeta({ page: "warehouse", id: "w-99999" }, "ru");
    expect(w.noindex).toBe(true);
    expect(w.ru).toBe("/");

    expect(pageMeta({ page: "legal", id: "нет-такого" }, "ru").noindex).toBe(true);
  });

  it("ставит в заголовок название склада, а не слово «склад»", () => {
    // По корешку вкладки человек различает склады, открытые для сравнения.
    const title = pageMeta({ page: "warehouse", id: WAREHOUSES[0].id }, "ru").title;
    expect(title).toContain(WAREHOUSES[0].name.ru);
    expect(title).toContain(WAREHOUSES[0].cityTitle.ru);
  });

  it("список документов — это страница, а не тупик", () => {
    // У `/legal/` нет второго сегмента, и путать её с несуществующим
    // документом нельзя: это оглавление правовой части.
    expect(pageMeta({ page: "legal" }, "ru").noindex).toBe(false);
  });

  it("даёт обеим языковым версиям адреса друг друга", () => {
    const meta = pageMeta({ page: "market" }, "en");
    expect(meta.ru).toBe("/market/");
    expect(meta.en).toBe("/en/market/");
  });

  it("описания укладываются в строку выдачи", () => {
    // Длиннее 160 знаков поисковик обрезает многоточием, и обрывается обычно
    // самое важное — конец фразы.
    for (const route of SITE_ROUTES) {
      for (const lang of ["ru", "en"] as const) {
        expect(pageMeta(route, lang).description.length).toBeLessThanOrEqual(160);
      }
    }
  });
});

describe("Список адресов", () => {
  it("содержит каждый склад и каждый документ", () => {
    // Карта сайта собирается по этому же списку: пропущенный здесь склад
    // поисковик найдёт только случайно, по ссылке из каталога.
    // Семь разделов: лендинг, страница склада, страница селлера, каталог,
    // тарифы, контакты и список правовых документов.
    expect(SITE_ROUTES.length).toBe(7 + LEGAL_DOCS.length + WAREHOUSES.length);
    for (const w of WAREHOUSES) {
      expect(SITE_ROUTES.some((r) => r.page === "warehouse" && r.id === w.id)).toBe(true);
    }
  });

  it("не содержит страниц, закрытых от индексации", () => {
    for (const route of SITE_ROUTES) {
      expect(pageMeta(route, "ru").noindex).toBe(false);
    }
  });
});

describe("buildSitemap", () => {
  const xml = buildSitemap("https://example.test", "2026-01-01");

  it("перечисляет русские адреса как основные", () => {
    expect(xml).toContain("<loc>https://example.test/market/</loc>");
    expect(xml).toContain("<loc>https://example.test/legal/offer/</loc>");
    expect((xml.match(/<url>/g) ?? []).length).toBe(SITE_ROUTES.length);
  });

  it("связывает языковые версии, а не плодит копии", () => {
    // Два адреса с одинаковым смыслом — это дубль в глазах поисковика, если
    // между ними нет `hreflang`. Английская версия перечислена внутри записи.
    expect(xml).toContain('hreflang="en" href="https://example.test/en/market/"');
    expect(xml).toContain('hreflang="x-default" href="https://example.test/"');
    expect(xml).not.toContain("<loc>https://example.test/en/");
  });
});
