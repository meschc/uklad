import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, PRICE_MAX, PRICE_MIN, type MarketFilters } from "../filters";
import { filtersQuery, isGradualChange, marketSearch, readFilters } from "../marketQuery";

/**
 * Отбор витрины в адресе страницы.
 *
 * Этот адрес пересылают: он живёт в переписке, в закладках и в рекламных
 * ссылках, то есть переживает и опечатки, и обрезку почтовым клиентом, и
 * правку руками. Поэтому проверяем не «строка собралась», а две вещи, ради
 * которых всё затевалось: собранное читается обратно один в один, а любой
 * мусор в адресе даёт витрину без отбора, а не пустую выдачу.
 */

const with_ = (patch: Partial<MarketFilters>): MarketFilters => ({ ...DEFAULT_FILTERS, ...patch });

describe("filtersQuery", () => {
  it("не пишет в адрес значения по умолчанию", () => {
    // Чистая витрина обязана открываться по чистому `/market/`: иначе в
    // индексе поисковика окажется десяток адресов с одним содержимым.
    expect(filtersQuery(DEFAULT_FILTERS)).toBe("");
  });

  it("складывает списки через запятую, а не повтором имени", () => {
    const query = filtersQuery(with_({ marketplaces: ["ozon", "wildberries"] }));
    // Запятая остаётся запятой: адрес с четырьмя площадками читают глазами.
    expect(query).toBe("mp=ozon,wildberries");
  });

  it("пишет только заданное руками", () => {
    const query = filtersQuery(
      with_({ city: "Химки", verifiedOnly: true, maxStorage: PRICE_MAX - 10 }),
    );
    expect(new URLSearchParams(query).get("city")).toBe("Химки");
    expect(new URLSearchParams(query).get("verified")).toBe("1");
    expect(new URLSearchParams(query).get("price")).toBe(String(PRICE_MAX - 10));
    expect(new URLSearchParams(query).has("sort")).toBe(false);
  });
});

describe("readFilters", () => {
  it("читает обратно всё, что записал", () => {
    const filters = with_({
      q: "Химки",
      city: "Москва",
      schemes: ["FBS"],
      marketplaces: ["ozon", "wildberries"],
      services: ["marking", "returns"],
      maxStorage: PRICE_MIN + 5,
      verifiedOnly: true,
      ukladOnly: true,
      sort: "price",
    });

    expect(readFilters(`?${filtersQuery(filters)}`)).toEqual(filters);
  });

  it("отдаёт витрину без отбора на пустой адрес", () => {
    expect(readFilters("")).toEqual(DEFAULT_FILTERS);
  });

  it("выбрасывает незнакомые значения, а не показывает пустую витрину", () => {
    // Адрес правят руками и режут при пересылке. Отвечать на это «ничего не
    // найдено» нельзя: человек решит, что складов нет вовсе.
    const filters = readFilters("?city=Атлантида&mp=ozon,авито&scheme=FBX&sort=cheap");
    expect(filters.city).toBe("");
    expect(filters.marketplaces).toEqual(["ozon"]);
    expect(filters.schemes).toEqual([]);
    expect(filters.sort).toBe(DEFAULT_FILTERS.sort);
  });

  it("схлопывает повторы в списке", () => {
    expect(readFilters("?mp=ozon,ozon").marketplaces).toEqual(["ozon"]);
  });

  it("держит потолок цены в пределах шкалы", () => {
    expect(readFilters("?price=0").maxStorage).toBe(PRICE_MIN);
    expect(readFilters("?price=999999").maxStorage).toBe(PRICE_MAX);
    expect(readFilters("?price=дёшево").maxStorage).toBe(PRICE_MAX);
  });
});

describe("marketSearch", () => {
  it("оставляет чужие параметры на месте", () => {
    // Метку кампании ставят снаружи, и стирать её от того, что человек выбрал
    // город, витрина не вправе: переход перестал бы считаться рекламным.
    const search = marketSearch("?utm_source=vk", with_({ city: "Москва" }));
    const params = new URLSearchParams(search);
    expect(params.get("utm_source")).toBe("vk");
    expect(params.get("city")).toBe("Москва");
  });

  it("убирает из адреса снятые условия", () => {
    expect(marketSearch("?city=Москва&verified=1", DEFAULT_FILTERS)).toBe("");
    expect(marketSearch("?city=Москва&utm_source=vk", DEFAULT_FILTERS)).toBe("?utm_source=vk");
  });
});

describe("isGradualChange", () => {
  it("считает плавными набор в поиске и ведение ползунка", () => {
    expect(isGradualChange(DEFAULT_FILTERS, with_({ q: "Хим" }))).toBe(true);
    expect(isGradualChange(with_({ q: "Хим" }), with_({ q: "Химки" }))).toBe(true);
    expect(isGradualChange(DEFAULT_FILTERS, with_({ maxStorage: PRICE_MIN }))).toBe(true);
  });

  it("считает отдельным решением всё, что ставят одним движением", () => {
    expect(isGradualChange(DEFAULT_FILTERS, with_({ city: "Москва" }))).toBe(false);
    expect(isGradualChange(DEFAULT_FILTERS, with_({ verifiedOnly: true }))).toBe(false);
    expect(isGradualChange(DEFAULT_FILTERS, with_({ sort: "price" }))).toBe(false);
    expect(isGradualChange(DEFAULT_FILTERS, with_({ services: ["marking"] }))).toBe(false);
  });

  it("не путает плавную правку с отдельной, когда меняются обе разом", () => {
    // Сброс фильтров стирает и строку поиска, и отметки: это одно решение
    // человека, и в истории оно обязано быть отдельным шагом.
    expect(isGradualChange(with_({ q: "Химки", verifiedOnly: true }), DEFAULT_FILTERS)).toBe(false);
  });
});
