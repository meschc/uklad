import { describe, expect, test } from "vitest";
import { MILESTONES, RELEASES, STATUS_ORDER, TRACK_LABELS, type Status } from "../roadmap";
import { ROADMAP_ITEMS } from "../roadmapItems";

/**
 * Дорожная карта — публичное обещание, и проверять здесь нужно не «работает ли
 * код», а «не врёт ли страница». Врать она может тремя способами, и на каждый
 * есть проверка ниже:
 *
 *  - сроком там, где срока нет (квартал у идеи читается как обещание);
 *  - выпуском, которого не было (версия обязана существовать в журнале);
 *  - вехой, у которой ничего нет (пустая полоса прогресса выглядит работой).
 *
 * Все они ловятся статически, без запуска страницы: данные тут статические, и
 * это единственная причина, по которой такие проверки вообще возможны.
 */

const QUARTER_PATTERN = /^\d{4}-Q[1-4]$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Стадии, у которых срок — ориентир, а не факт и не пустое обещание. */
const DATED_STATUSES: readonly Status[] = ["planned", "progress"];

describe("пункты дорожной карты", () => {
  test("идентификаторы не повторяются", () => {
    const ids = ROADMAP_ITEMS.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test("каждый пункт относится к существующей вехе", () => {
    const known = new Set(MILESTONES.map((milestone) => milestone.id));

    const orphans = ROADMAP_ITEMS.filter((item) => !known.has(item.milestone));

    expect(orphans.map((item) => item.id)).toEqual([]);
  });

  test("каждый пункт относится к известному направлению", () => {
    const unknown = ROADMAP_ITEMS.filter((item) => !(item.track in TRACK_LABELS));

    expect(unknown.map((item) => item.id)).toEqual([]);
  });

  test("квартал стоит ровно у запланированного и у того, что делается", () => {
    const wrong = ROADMAP_ITEMS.filter(
      (item) => Boolean(item.quarter) !== DATED_STATUSES.includes(item.status),
    );

    expect(wrong.map((item) => item.id)).toEqual([]);
  });

  test("квартал записан форматом ГГГГ-Qn", () => {
    const quarters = ROADMAP_ITEMS.flatMap((item) => (item.quarter ? [item.quarter] : []));

    expect(quarters.every((quarter) => QUARTER_PATTERN.test(quarter))).toBe(true);
  });

  test("версия стоит только у готового", () => {
    const wrong = ROADMAP_ITEMS.filter((item) => item.version && item.status !== "done");

    expect(wrong.map((item) => item.id)).toEqual([]);
  });

  test("версия пункта есть в журнале выпусков", () => {
    const released = new Set(RELEASES.map((release) => release.version));

    const invented = ROADMAP_ITEMS.filter((item) => item.version && !released.has(item.version));

    expect(invented.map((item) => item.id)).toEqual([]);
  });

  test("у каждого пункта заполнены обе языковые версии", () => {
    const empty = ROADMAP_ITEMS.filter(
      (item) => !item.title.ru || !item.title.en || !item.summary.ru || !item.summary.en,
    );

    expect(empty.map((item) => item.id)).toEqual([]);
  });

  test("каждая стадия из порядка колонок кем-то занята", () => {
    const used = new Set(ROADMAP_ITEMS.map((item) => item.status));

    expect(STATUS_ORDER.filter((status) => !used.has(status))).toEqual([]);
  });
});

describe("вехи", () => {
  test("идентификаторы не повторяются", () => {
    const ids = MILESTONES.map((milestone) => milestone.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test("у каждой вехи есть хотя бы один пункт", () => {
    const empty = MILESTONES.filter(
      (milestone) => !ROADMAP_ITEMS.some((item) => item.milestone === milestone.id),
    );

    expect(empty.map((milestone) => milestone.id)).toEqual([]);
  });

  test("ориентир вехи записан форматом ГГГГ-Qn", () => {
    const targets = MILESTONES.flatMap((milestone) => (milestone.target ? [milestone.target] : []));

    expect(targets.every((target) => QUARTER_PATTERN.test(target))).toBe(true);
  });

  test("веха без ориентира — только завершённая целиком", () => {
    const openEnded = MILESTONES.filter((milestone) => !milestone.target);

    const unfinished = openEnded.filter((milestone) =>
      ROADMAP_ITEMS.some((item) => item.milestone === milestone.id && item.status !== "done"),
    );

    expect(unfinished.map((milestone) => milestone.id)).toEqual([]);
  });
});

describe("журнал выпусков", () => {
  test("версии не повторяются", () => {
    const versions = RELEASES.map((release) => release.version);

    expect(new Set(versions).size).toBe(versions.length);
  });

  test("даты записаны в ISO", () => {
    const dates = RELEASES.map((release) => release.date);

    expect(dates.every((date) => ISO_DATE_PATTERN.test(date))).toBe(true);
  });

  test("выпуски идут от нового к старому", () => {
    const dates = RELEASES.map((release) => release.date);

    expect(dates).toEqual([...dates].sort().reverse());
  });

  test("у каждого выпуска есть, что показать", () => {
    const silent = RELEASES.filter((release) => release.highlights.length === 0);

    expect(silent.map((release) => release.version)).toEqual([]);
  });
});
